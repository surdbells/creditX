<?php

declare(strict_types=1);

/**
 * CreditX — Push Notification Template Seeder
 *
 * Seeds NotificationTemplate rows with channel=PUSH for the eight loan
 * lifecycle events currently dispatched in the codebase:
 *
 *   loan_captured         — CreateLoanAction, on successful persist
 *   loan_submitted        — SubmitLoanAction, after approval workflow init
 *   loan_approval_step    — ApprovalEngineService, intermediate approval
 *   loan_approved         — ApprovalEngineService, final approval
 *   loan_rejected         — ApprovalEngineService, rejection
 *   loan_disbursed        — DisburseLoanAction, disbursement
 *   payment_received      — PostRepaymentAction, after audit log
 *   overdue_reminder      — OverdueService, daily sweep
 *
 * Each template is seeded at most once. The seeder checks for an existing
 * row with the same code before inserting — re-running is a no-op once
 * everything is in place.
 *
 * Template body placeholders match the context variables that each event
 * actually passes to NotificationDispatchService::dispatchEvent, verified
 * by grepping the callsites:
 *
 *   {{application_id}}     all events
 *   {{customer_name}}      all events
 *   {{loan_amount}}        all events (value formatted by caller)
 *   {{step_name}}          approval events only
 *   {{action}}             approval events only ('approved' / 'rejected')
 *   {{payment_amount}}     payment_received only
 *
 * FCM payload notes:
 *   - title = template.subject, rendered with the context
 *   - body  = template.body, rendered with the context
 *   - FCM treats these as the display strings; the agent app's Capacitor
 *     push handler may show a system notification and/or an in-app toast
 *     depending on foreground state.
 *   - Keep body short — some Android launchers truncate at ~120 chars.
 *
 * Usage:
 *   php bin/seed-push-templates.php               # dry-run
 *   php bin/seed-push-templates.php --apply       # apply with prompt
 *   php bin/seed-push-templates.php --apply --yes # apply without prompt
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}
$_ENV['APP_ENV'] = $_ENV['APP_ENV'] ?? 'production';

$args = $argv ?? [];
$apply = in_array('--apply', $args, true);
$yes   = in_array('--yes', $args, true);

echo "================================================================\n";
echo " CreditX push notification template seeder\n";
echo "================================================================\n";
echo " Mode: " . ($apply ? 'APPLY (will insert rows)' : 'DRY-RUN (read-only)') . "\n\n";

try {
    $em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
} catch (\Throwable $e) {
    fwrite(STDERR, "✘ Could not connect to database:\n  " . $e->getMessage() . "\n");
    exit(1);
}

// Template definitions. Each maps an event-trigger to the push title + body.
// Code is uppercased by the entity setter — we keep these lowercase here
// for readability; the final row will have e.g. 'LOAN_APPROVED_PUSH'.
$templates = [
    [
        'code'          => 'loan_captured_push',
        'name'          => 'Loan Captured — Push',
        'event_trigger' => 'loan_captured',
        'subject'       => 'Loan captured',
        'body'          => "Loan {{application_id}} for {{customer_name}} has been captured.",
    ],
    [
        'code'          => 'loan_submitted_push',
        'name'          => 'Loan Submitted — Push',
        'event_trigger' => 'loan_submitted',
        'subject'       => 'Loan submitted for approval',
        'body'          => "Loan {{application_id}} for {{customer_name}} has been submitted for approval.",
    ],
    [
        'code'          => 'loan_approval_step_push',
        'name'          => 'Loan Approval Step — Push',
        'event_trigger' => 'loan_approval_step',
        'subject'       => 'Loan update',
        'body'          => "Your loan {{application_id}} was {{action}} at the {{step_name}} step.",
    ],
    [
        'code'          => 'loan_approved_push',
        'name'          => 'Loan Approved — Push',
        'event_trigger' => 'loan_approved',
        'subject'       => 'Loan approved ✓',
        'body'          => "Loan {{application_id}} for {{customer_name}} has been approved.",
    ],
    [
        'code'          => 'loan_rejected_push',
        'name'          => 'Loan Rejected — Push',
        'event_trigger' => 'loan_rejected',
        'subject'       => 'Loan rejected',
        'body'          => "Loan {{application_id}} for {{customer_name}} was rejected.",
    ],
    [
        'code'          => 'loan_disbursed_push',
        'name'          => 'Loan Disbursed — Push',
        'event_trigger' => 'loan_disbursed',
        'subject'       => 'Loan disbursed 💰',
        'body'          => "Loan {{application_id}} disbursed: ₦{{loan_amount}} to {{customer_name}}.",
    ],
    [
        'code'          => 'payment_received_push',
        'name'          => 'Payment Received — Push',
        'event_trigger' => 'payment_received',
        'subject'       => 'Payment received',
        'body'          => "₦{{payment_amount}} received for loan {{application_id}} ({{customer_name}}).",
    ],
    [
        'code'          => 'overdue_reminder_push',
        'name'          => 'Overdue Reminder — Push',
        'event_trigger' => 'overdue_reminder',
        'subject'       => 'Loan overdue',
        'body'          => "Loan {{application_id}} for {{customer_name}} is overdue — ₦{{loan_amount}} outstanding.",
    ],
];

$repo = $em->getRepository(\App\Domain\Entity\NotificationTemplate::class);

// Pre-check — which codes already exist?
$toCreate = [];
$existing = [];
foreach ($templates as $def) {
    $row = $repo->findOneBy(['code' => strtoupper($def['code'])]);
    if ($row === null) {
        $toCreate[] = $def;
    } else {
        $existing[] = ['code' => $row->getCode(), 'channel' => $row->getChannel()->value];
    }
}

echo "Template plan:\n";
echo "  " . str_repeat('-', 90) . "\n";
echo sprintf("  %-30s  %-22s  %s\n", 'code', 'event_trigger', 'status');
echo "  " . str_repeat('-', 90) . "\n";

foreach ($existing as $row) {
    echo sprintf("  %-30s  %-22s  already exists (channel=%s)\n",
        $row['code'], '—', $row['channel']);
}
foreach ($toCreate as $def) {
    echo sprintf("  %-30s  %-22s  will CREATE (channel=push)\n",
        strtoupper($def['code']), $def['event_trigger']);
}
echo "  " . str_repeat('-', 90) . "\n\n";

if (empty($toCreate)) {
    echo "✓ Nothing to do. All 8 push templates are already seeded.\n";
    exit(0);
}

if (!$apply) {
    echo "Dry-run only. " . count($toCreate) . " template(s) would be created.\n";
    echo "To apply:\n  php bin/seed-push-templates.php --apply\n";
    exit(0);
}

if (!$yes) {
    echo "Proceed with creating " . count($toCreate) . " template(s)? [y/N]: ";
    $line = trim((string) fgets(STDIN));
    if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
        echo "Aborted by user.\n";
        exit(2);
    }
}

echo "\nInserting...\n";
$em->beginTransaction();
try {
    foreach ($toCreate as $def) {
        $t = new \App\Domain\Entity\NotificationTemplate();
        $t->setCode($def['code']);
        $t->setName($def['name']);
        $t->setChannel(\App\Domain\Enum\NotificationChannel::PUSH);
        $t->setEventTrigger($def['event_trigger']);
        $t->setSubject($def['subject']);
        $t->setBody($def['body']);
        $t->setIsActive(true);
        $em->persist($t);
        echo "  ✓ Created " . strtoupper($def['code']) . "\n";
    }
    $em->flush();
    $em->commit();
    echo "\n✓ " . count($toCreate) . " template(s) created.\n";

    // Verification query — confirm they're in the DB and indexed by event_trigger
    echo "\nVerification:\n";
    foreach ($toCreate as $def) {
        $byEvent = $repo->findBy(['eventTrigger' => $def['event_trigger']]);
        $pushCount = count(array_filter(
            $byEvent,
            fn ($t) => $t->getChannel() === \App\Domain\Enum\NotificationChannel::PUSH
        ));
        echo sprintf("  %s templates for event_trigger=%s : %d\n",
            $pushCount >= 1 ? '✓' : '✘', $def['event_trigger'], $pushCount);
    }

    echo "\nDone. Re-running this script is safe (no-op once templates exist).\n";
    exit(0);
} catch (\Throwable $e) {
    $em->rollback();
    fwrite(STDERR, "✘ Seed failed, transaction rolled back:\n  " . $e->getMessage() . "\n");
    exit(1);
}
