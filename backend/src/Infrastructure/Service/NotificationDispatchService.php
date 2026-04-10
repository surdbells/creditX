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

        $payload = [
            'from' => ['address' => $_ENV['ZEPTOMAIL_FROM_EMAIL'] ?? 'noreply@creditx.com', 'name' => $_ENV['ZEPTOMAIL_FROM_NAME'] ?? 'CreditX'],
            'to' => [['email_address' => ['address' => $notification->getRecipient()]]],
            'subject' => $notification->getSubject() ?? 'CreditX Notification',
            'htmlbody' => '<html><body>' . nl2br(htmlspecialchars($notification->getBody())) . '</body></html>',
        ];

        $ch = curl_init('https://api.zeptomail.com/v1.1/email');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Zoho-enczapikey ' . $apiKey],
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
}
