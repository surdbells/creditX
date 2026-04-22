<?php

declare(strict_types=1);

/**
 * CreditX — Loan Rejection Templates Seeder
 *
 * Seeds EMAIL + IN_APP notification templates for the 'loan_rejected'
 * event. Until this seeder, only a PUSH template existed — so agents
 * with desktop access (no phone) or email-only preferences missed
 * their rejection reason entirely.
 *
 * The templates include the reviewer's comment as {{comment}} so the
 * agent sees WHY the loan was rejected, not just THAT it was rejected.
 * The ApprovalEngineService.decide() method (commit K) includes the
 * comment in the dispatch context.
 *
 * Usage:
 *   php bin/seed-loan-rejected-templates.php               # dry-run
 *   php bin/seed-loan-rejected-templates.php --apply       # apply, prompt
 *   php bin/seed-loan-rejected-templates.php --apply --yes # apply, no prompt
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

echo "=== CreditX Loan Rejection Templates Seeder ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();

$apply = in_array('--apply', $argv, true);
$yes = in_array('--yes', $argv, true);

$templates = [
    [
        'code'          => 'loan_rejected_email',
        'name'          => 'Loan Rejected — Email',
        'channel'       => \App\Domain\Enum\NotificationChannel::EMAIL,
        'event_trigger' => 'loan_rejected',
        'subject'       => 'Your loan application {{application_id}} was rejected',
        'body'          => <<<EMAIL
Hi,

The loan application for {{customer_name}} (ID: {{application_id}}) has been rejected at the {{step_name}} step.

Reason provided by {{reviewer_name}}:

{{comment}}

You can discuss this with the reviewing team directly from your inbox — a loan-scoped conversation has been opened for this application.

— CreditX
EMAIL,
    ],
    [
        'code'          => 'loan_rejected_in_app',
        'name'          => 'Loan Rejected — In-App',
        'channel'       => \App\Domain\Enum\NotificationChannel::IN_APP,
        'event_trigger' => 'loan_rejected',
        'subject'       => 'Loan {{application_id}} rejected',
        'body'          => "Loan {{application_id}} for {{customer_name}} was rejected by {{reviewer_name}} at the {{step_name}} step. Reason: {{comment}}",
    ],
    // We also update the push template's body to include the comment so the
    // notification preview on the phone tells the agent WHY, not just that
    // something happened. The seeder detects an existing loan_rejected_push
    // row and updates its body in place if the content has drifted from the
    // intended 'with-comment' version.
    [
        'code'          => 'loan_rejected_push',
        'name'          => 'Loan Rejected — Push',
        'channel'       => \App\Domain\Enum\NotificationChannel::PUSH,
        'event_trigger' => 'loan_rejected',
        'subject'       => 'Loan {{application_id}} rejected',
        'body'          => "Loan for {{customer_name}} rejected at {{step_name}}. Reason: {{comment}}",
        'upsert'        => true, // Treat as update-if-exists rather than create-if-missing
    ],
];

$repo = $em->getRepository(\App\Domain\Entity\NotificationTemplate::class);

$toCreate = [];
$toUpdate = [];
$unchanged = [];

foreach ($templates as $def) {
    $existing = $repo->findOneBy(['code' => $def['code']]);
    if ($existing === null) {
        $toCreate[] = $def;
    } elseif (!empty($def['upsert'])) {
        // Compare current body with intended body; only update if drifted.
        if ($existing->getBody() !== $def['body']) {
            $toUpdate[] = ['def' => $def, 'entity' => $existing];
        } else {
            $unchanged[] = $def['code'];
        }
    } else {
        $unchanged[] = $def['code'];
    }
}

echo "Plan:\n";
echo "  " . count($toCreate) . " template(s) to create\n";
echo "  " . count($toUpdate) . " template(s) to update (push body drifted)\n";
echo "  " . count($unchanged) . " template(s) unchanged\n\n";

if (empty($toCreate) && empty($toUpdate)) {
    echo "Nothing to do — all templates in place and up to date.\n";
    exit(0);
}

foreach ($toCreate as $def) {
    echo "  + CREATE " . $def['code'] . " (" . $def['channel']->value . ")\n";
}
foreach ($toUpdate as $row) {
    echo "  ~ UPDATE " . $row['def']['code'] . " (" . $row['def']['channel']->value . ")\n";
}

if (!$apply) {
    echo "\nDry-run only. To apply:\n  php bin/seed-loan-rejected-templates.php --apply\n";
    exit(0);
}

if (!$yes) {
    echo "\nProceed? [y/N]: ";
    $line = trim((string) fgets(STDIN));
    if (strtolower($line) !== 'y' && strtolower($line) !== 'yes') {
        echo "Aborted.\n";
        exit(2);
    }
}

echo "\nApplying...\n";
$em->beginTransaction();
try {
    foreach ($toCreate as $def) {
        $t = new \App\Domain\Entity\NotificationTemplate();
        $t->setCode($def['code']);
        $t->setName($def['name']);
        $t->setChannel($def['channel']);
        $t->setEventTrigger($def['event_trigger']);
        $t->setSubject($def['subject']);
        $t->setBody($def['body']);
        $t->setIsActive(true);
        $em->persist($t);
        echo "  ✓ Created " . $def['code'] . "\n";
    }
    foreach ($toUpdate as $row) {
        $row['entity']->setSubject($row['def']['subject']);
        $row['entity']->setBody($row['def']['body']);
        echo "  ✓ Updated " . $row['def']['code'] . "\n";
    }
    $em->flush();
    $em->commit();
    echo "\n✓ Applied " . (count($toCreate) + count($toUpdate)) . " change(s).\n";
    exit(0);
} catch (\Throwable $e) {
    $em->rollback();
    fwrite(STDERR, "✘ Seed failed: " . $e->getMessage() . "\n");
    exit(1);
}
