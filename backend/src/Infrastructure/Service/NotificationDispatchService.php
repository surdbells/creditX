<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Notification;
use App\Domain\Entity\NotificationTemplate;
use App\Domain\Enum\NotificationChannel;
use App\Domain\Enum\NotificationStatus;
use App\Domain\Repository\NotificationRepository;
use App\Domain\Repository\NotificationTemplateRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

final class NotificationDispatchService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly NotificationTemplateRepository $templateRepo,
        private readonly NotificationRepository $notifRepo,
        private readonly SettingsCacheService $settings,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Dispatch notifications for a specific event.
     * Finds all active templates for the event and sends via their configured channels.
     */
    public function dispatchEvent(string $event, array $context, ?string $userId = null, ?string $customerId = null): array
    {
        $templates = $this->templateRepo->findByEvent($event);
        $dispatched = [];

        foreach ($templates as $template) {
            $channelEnabled = match ($template->getChannel()) {
                NotificationChannel::EMAIL => $this->settings->getBool('notification.email_enabled', true),
                NotificationChannel::SMS => $this->settings->getBool('notification.sms_enabled', true),
                NotificationChannel::WHATSAPP => $this->settings->getBool('notification.whatsapp_enabled', false),
                NotificationChannel::IN_APP => true,
            };

            if (!$channelEnabled) continue;

            $recipient = $this->resolveRecipient($template->getChannel(), $context);
            if ($recipient === null) continue;

            $notification = new Notification();
            $notification->setTemplateId($template->getId());
            $notification->setUserId($userId);
            $notification->setCustomerId($customerId);
            $notification->setChannel($template->getChannel());
            $notification->setRecipient($recipient);
            $notification->setSubject($template->renderSubject($context));
            $notification->setBody($template->render($context));

            try {
                $this->send($notification);
                $dispatched[] = ['channel' => $template->getChannel()->value, 'status' => 'sent', 'recipient' => $recipient];
            } catch (\Exception $e) {
                $notification->markFailed($e->getMessage());
                $dispatched[] = ['channel' => $template->getChannel()->value, 'status' => 'failed', 'error' => $e->getMessage()];
                $this->logger->error('Notification dispatch failed', ['channel' => $template->getChannel()->value, 'error' => $e->getMessage()]);
            }

            $this->em->persist($notification);
        }

        $this->em->flush();
        return $dispatched;
    }

    /**
     * Send a single notification via its channel.
     */
    public function send(Notification $notification): void
    {
        match ($notification->getChannel()) {
            NotificationChannel::EMAIL => $this->sendEmail($notification),
            NotificationChannel::SMS => $this->sendSms($notification),
            NotificationChannel::WHATSAPP => $this->sendWhatsApp($notification),
            NotificationChannel::IN_APP => $this->sendInApp($notification),
        };
    }

    /**
     * Send via ZeptoMail.
     */
    private function sendEmail(Notification $notification): void
    {
        $apiKey = $_ENV['ZEPTOMAIL_API_KEY'] ?? '';
        if ($apiKey === '') {
            $notification->markSent(); // In dev, mark as sent without actually sending
            return;
        }

        $subject = $notification->getSubject() ?? 'CreditX Notification';
        $body = $notification->getBody();
        $htmlBody = $this->buildBrandedEmail($subject, $body);

        $payload = [
            'from' => ['address' => $_ENV['ZEPTOMAIL_FROM_EMAIL'] ?? 'noreply@dostsuite.com', 'name' => $_ENV['ZEPTOMAIL_FROM_NAME'] ?? 'CreditX'],
            'to' => [['email_address' => ['address' => $notification->getRecipient()]]],
            'subject' => $subject,
            'htmlbody' => $htmlBody,
        ];

        $ch = curl_init('https://api.zeptomail.com/v1.1/email');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: ' . $apiKey],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300) {
            $notification->markSent();
        } else {
            throw new \RuntimeException('ZeptoMail failed: HTTP ' . $httpCode . ' - ' . ($response ?: 'No response'));
        }
    }

    /**
     * Send via Termii SMS.
     */
    private function sendSms(Notification $notification): void
    {
        $apiKey = $_ENV['TERMII_API_KEY'] ?? '';
        if ($apiKey === '') {
            $notification->markSent();
            return;
        }

        $payload = [
            'to' => $notification->getRecipient(),
            'from' => $_ENV['TERMII_SENDER_ID'] ?? 'CreditX',
            'sms' => $notification->getBody(),
            'type' => 'plain',
            'channel' => 'generic',
            'api_key' => $apiKey,
        ];

        $ch = curl_init('https://api.ng.termii.com/api/sms/send');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300) {
            $notification->markSent();
        } else {
            throw new \RuntimeException('Termii SMS failed: HTTP ' . $httpCode);
        }
    }

    /**
     * Send via Termii WhatsApp.
     */
    private function sendWhatsApp(Notification $notification): void
    {
        // WhatsApp via Termii uses the same API with channel = 'whatsapp'
        $apiKey = $_ENV['TERMII_API_KEY'] ?? '';
        if ($apiKey === '') {
            $notification->markSent();
            return;
        }

        $payload = [
            'to' => $notification->getRecipient(),
            'from' => $_ENV['TERMII_SENDER_ID'] ?? 'CreditX',
            'sms' => $notification->getBody(),
            'type' => 'plain',
            'channel' => 'whatsapp',
            'api_key' => $apiKey,
        ];

        $ch = curl_init('https://api.ng.termii.com/api/sms/send');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300) {
            $notification->markSent();
        } else {
            throw new \RuntimeException('Termii WhatsApp failed: HTTP ' . $httpCode);
        }
    }

    /**
     * Store in-app notification (no external send).
     */
    private function sendInApp(Notification $notification): void
    {
        $notification->markSent();
        // WebSocket broadcast would happen here in production via Redis pub/sub
    }

    /**
     * Resolve recipient address based on channel.
     */
    private function resolveRecipient(NotificationChannel $channel, array $context): ?string
    {
        return match ($channel) {
            NotificationChannel::EMAIL => $context['customer_email'] ?? $context['email'] ?? null,
            NotificationChannel::SMS, NotificationChannel::WHATSAPP => $context['customer_phone'] ?? $context['phone'] ?? null,
            NotificationChannel::IN_APP => $context['user_id'] ?? null,
        };
    }

    /**
     * Build branded HTML email template.
     */
    private function buildBrandedEmail(string $subject, string $body): string
    {
        $bodyHtml = nl2br(htmlspecialchars($body));
        $year = date('Y');

        return <<<HTML
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9fa">
            <div style="background:linear-gradient(135deg,#0A4F2A 0%,#0d6b3a 100%);padding:24px;text-align:center;border-radius:0 0 20px 20px">
                <h1 style="color:#fff;font-size:24px;margin:0;font-weight:800">Credit<span style="color:#C9A227">X</span></h1>
                <p style="color:rgba(255,255,255,0.6);font-size:11px;margin:6px 0 0;text-transform:uppercase;letter-spacing:2px">Loan Management System</p>
            </div>
            <div style="padding:28px 24px">
                <h2 style="color:#1a1a2e;font-size:16px;margin:0 0 16px;font-weight:700">{$subject}</h2>
                <div style="color:#374151;font-size:14px;line-height:1.6">{$bodyHtml}</div>
            </div>
            <div style="padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center">
                <p style="color:#9ca3af;font-size:11px;margin:0">&copy; {$year} Kodek Innovations Limited &bull; CreditX</p>
            </div>
        </div>
        HTML;
    }
}
