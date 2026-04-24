<?php

declare(strict_types=1);

use App\Action\Auth;
use App\Action\Agent;
use App\Action\Storage;
use App\Action\User;
use App\Action\Location;
use App\Action\Role;
use App\Action\Setting;
use App\Action\Audit;
use App\Action\RecordType;
use App\Action\GovRecord;
use App\Action\Customer;
use App\Action\Document;
use App\Action\FeeType;
use App\Action\LoanProduct;
use App\Action\Loan;
use App\Action\Approval;
use App\Action\ApprovalWorkflow;
use App\Action\Accounting;
use App\Action\Disbursement;
use App\Action\MakerChecker;
use App\Action\Payment;
use App\Action\Penalty;
use App\Action\Notification;
use App\Action\Messaging;
use App\Action\Channel;
use App\Action\Device;
use App\Action\Report;
use App\Action\DsaTarget;
use App\Action\Department;
use App\Action\Team;
use App\Action\Reconciliation;
use App\Action\ListBanksAction;
use App\Infrastructure\Middleware\AuthMiddleware;
use App\Infrastructure\Middleware\RbacMiddleware;
use App\Infrastructure\Service\JwtService;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

return function (App $app): void {

    // ─── Health check ───
    $app->get('/api/health', function ($request, $response) {
        $response->getBody()->write(json_encode([
            'status' => 'ok',
            'service' => 'creditx-api',
            'version' => '2.0.0',
            'timestamp' => date('Y-m-d H:i:s'),
        ]));
        return $response->withHeader('Content-Type', 'application/json');
    });

    // ─── Auth (public) ───
    $app->group('/api/auth', function (RouteCollectorProxy $group) {
        $group->post('/login', Auth\LoginAction::class);
        $group->post('/verify-otp', Auth\VerifyOtpAction::class);
        $group->post('/refresh', Auth\RefreshTokenAction::class);
        $group->post('/forgot-password', Auth\ForgotPasswordAction::class);
        $group->post('/reset-password', Auth\ResetPasswordAction::class);
    });

    // ─── Paystack Webhook (public, signature-verified) ───
    $app->post('/api/payments/webhook/paystack', Payment\PaystackWebhookAction::class);

    // ─── Public Storage (avatars, uploads) ───
    // Two paths serve the same action:
    //   /storage/{path}      — legacy, public (outside /api prefix). Some
    //                          deploys have nginx rewriting or static-file
    //                          serving configured here, which can break
    //                          after a deploy that rebuilds public/.
    //   /api/storage/{path}  — robust alias. Lives under /api so it's
    //                          guaranteed to be routed to PHP regardless
    //                          of nginx location block shenanigans.
    // Both are public (not inside the authenticated /api group further
    // down) since avatars need to be embeddable from the frontend without
    // sending the Authorization header. If you need auth-gated storage,
    // register a separate route inside the authenticated group.
    $app->get('/storage/{path:.*}', Storage\ServeFileAction::class);
    $app->get('/api/storage/{path:.*}', Storage\ServeFileAction::class);

    // ─── Public utility endpoints ───
    $app->get('/api/banks', ListBanksAction::class);

    // ─── Authenticated routes ───
    $app->group('/api', function (RouteCollectorProxy $api) {

        // Auth (authenticated)
        $api->group('/auth', function (RouteCollectorProxy $group) {
            $group->post('/logout', Auth\LogoutAction::class);
            $group->get('/me', Auth\MeAction::class);
            $group->post('/change-password', Auth\ChangePasswordAction::class);
        });

        // ─── Agent dashboard (authenticated, no specific permission — own data only) ───
        $api->get('/agent/dashboard-stats', Agent\GetDashboardStatsAction::class);

        // ─── Users ───
        $api->group('/users', function (RouteCollectorProxy $group) {
            // Self-service preferences (no RBAC — authenticated user edits own record)
            $group->patch('/me/preferences', User\UpdateMyPreferencesAction::class);

            // Bulk agent targets — registered BEFORE the /{id} routes so
            // the literal 'bulk-agent-targets' segment doesn't get
            // swallowed by the id wildcard matcher.
            $group->patch('/bulk-agent-targets', User\BulkUpdateAgentTargetsAction::class)
                ->add(new RbacMiddleware('settings.edit'));

            $group->get('', User\ListUsersAction::class)
                ->add(new RbacMiddleware('users.view'));
            $group->post('', User\CreateUserAction::class)
                ->add(new RbacMiddleware('users.create'));
            $group->get('/{id}', User\GetUserAction::class)
                ->add(new RbacMiddleware('users.view'));
            $group->put('/{id}', User\UpdateUserAction::class)
                ->add(new RbacMiddleware('users.edit'));
            $group->patch('/{id}/agent-target', User\UpdateAgentTargetAction::class)
                ->add(new RbacMiddleware('settings.edit'));
            $group->post('/{id}/reset-password', User\ResetUserPasswordAction::class)
                ->add(new RbacMiddleware('users.edit'));
            $group->post('/{id}/avatar', User\UploadAvatarAction::class)
                ->add(new RbacMiddleware('users.edit'));
        });

        // ─── Roles ───
        $api->group('/roles', function (RouteCollectorProxy $group) {
            $group->get('', Role\ListRolesAction::class)
                ->add(new RbacMiddleware('roles.view'));
            $group->post('', Role\CreateRoleAction::class)
                ->add(new RbacMiddleware('roles.create'));
            $group->get('/{id}', Role\GetRoleAction::class)
                ->add(new RbacMiddleware('roles.view'));
            $group->put('/{id}', Role\UpdateRoleAction::class)
                ->add(new RbacMiddleware('roles.edit'));
            $group->put('/{id}/permissions', Role\UpdateRolePermissionsAction::class)
                ->add(new RbacMiddleware('roles.edit'));
        });

        // ─── Permissions ───
        $api->get('/permissions', Role\ListPermissionsAction::class)
            ->add(new RbacMiddleware('roles.view'));

        // ─── Locations ───
        $api->group('/locations', function (RouteCollectorProxy $group) {
            $group->get('', Location\ListLocationsAction::class)
                ->add(new RbacMiddleware('locations.view'));
            $group->post('', Location\CreateLocationAction::class)
                ->add(new RbacMiddleware('locations.create'));
            $group->get('/{id}', Location\GetLocationAction::class)
                ->add(new RbacMiddleware('locations.view'));
            $group->put('/{id}', Location\UpdateLocationAction::class)
                ->add(new RbacMiddleware('locations.edit'));
        });

        // ─── Settings ───
        $api->group('/settings', function (RouteCollectorProxy $group) {
            $group->get('', Setting\ListSettingsAction::class)
                ->add(new RbacMiddleware('settings.view'));
            $group->post('', Setting\CreateSettingAction::class)
                ->add(new RbacMiddleware('settings.create'));
            $group->get('/{id}', Setting\GetSettingAction::class)
                ->add(new RbacMiddleware('settings.view'));
            $group->put('/{id}', Setting\UpdateSettingAction::class)
                ->add(new RbacMiddleware('settings.edit'));
            $group->delete('/{id}', Setting\DeleteSettingAction::class)
                ->add(new RbacMiddleware('settings.delete'));
        });

        // ─── Audit Logs ───
        $api->get('/audit-logs', Audit\ListAuditLogsAction::class)
            ->add(new RbacMiddleware('audit.view'));

        // ─── Record Types ───
        $api->group('/record-types', function (RouteCollectorProxy $group) {
            $group->get('', RecordType\ListRecordTypesAction::class)
                ->add(new RbacMiddleware('record_types.view'));
            $group->post('', RecordType\CreateRecordTypeAction::class)
                ->add(new RbacMiddleware('record_types.create'));
            $group->get('/{id}', RecordType\GetRecordTypeAction::class)
                ->add(new RbacMiddleware('record_types.view'));
            $group->put('/{id}', RecordType\UpdateRecordTypeAction::class)
                ->add(new RbacMiddleware('record_types.edit'));
            $group->delete('/{id}', RecordType\DeleteRecordTypeAction::class)
                ->add(new RbacMiddleware('record_types.delete'));
        });

        // ─── Government Records ───
        $api->group('/government-records', function (RouteCollectorProxy $group) {
            $group->get('', GovRecord\ListGovRecordsAction::class)
                ->add(new RbacMiddleware('records.view'));
            $group->post('', GovRecord\CreateGovRecordAction::class)
                ->add(new RbacMiddleware('records.create'));
            $group->get('/lookup/{staffId}', GovRecord\LookupStaffAction::class)
                ->add(new RbacMiddleware('records.view'));
            $group->get('/{id}/eligibility', GovRecord\GetEligibilityAction::class)
                ->add(new RbacMiddleware('records.view'));
            $group->post('/bulk-import', GovRecord\BulkImportAction::class)
                ->add(new RbacMiddleware('records.import'));
            $group->get('/{id}', GovRecord\GetGovRecordAction::class)
                ->add(new RbacMiddleware('records.view'));
            $group->put('/{id}', GovRecord\UpdateGovRecordAction::class)
                ->add(new RbacMiddleware('records.edit'));
            $group->delete('/{id}', GovRecord\DeleteGovRecordAction::class)
                ->add(new RbacMiddleware('records.delete'));
        });

        // ─── Customers ───
        $api->group('/customers', function (RouteCollectorProxy $group) {
            $group->get('', Customer\ListCustomersAction::class)
                ->add(new RbacMiddleware('customers.view'));
            $group->post('', Customer\CreateCustomerAction::class)
                ->add(new RbacMiddleware('customers.create'));
            // Look up a customer by IPPIS (staff_id) — used by the agent
            // loan-capture wizard to prefill the form. Route is placed
            // before /{id} so Slim doesn't treat "by-ippis" as an ID.
            $group->get('/by-ippis/{ippis}', Customer\FindByIppisAction::class)
                ->add(new RbacMiddleware('customers.view'));
            $group->get('/{id}', Customer\GetCustomerAction::class)
                ->add(new RbacMiddleware('customers.view'));
            $group->put('/{id}', Customer\UpdateCustomerAction::class)
                ->add(new RbacMiddleware('customers.edit'));
        });

        // ─── Documents ───
        $api->group('/documents', function (RouteCollectorProxy $group) {
            $group->get('', Document\ListDocumentsAction::class)
                ->add(new RbacMiddleware('customers.view'));
            $group->post('/upload', Document\UploadDocumentAction::class)
                ->add(new RbacMiddleware('customers.create'));
            $group->put('/{id}/verify', Document\VerifyDocumentAction::class)
                ->add(new RbacMiddleware('customers.edit'));
            $group->delete('/{id}', Document\DeleteDocumentAction::class)
                ->add(new RbacMiddleware('customers.edit'));
        });

        // ─── Fee Types ───
        $api->group('/fee-types', function (RouteCollectorProxy $group) {
            $group->get('', FeeType\ListFeeTypesAction::class)
                ->add(new RbacMiddleware('products.view'));
            $group->post('', FeeType\CreateFeeTypeAction::class)
                ->add(new RbacMiddleware('products.create'));
            $group->put('/{id}', FeeType\UpdateFeeTypeAction::class)
                ->add(new RbacMiddleware('products.edit'));
        });

        // ─── Loan Products ───
        $api->group('/loan-products', function (RouteCollectorProxy $group) {
            $group->get('', LoanProduct\ListProductsAction::class)
                ->add(new RbacMiddleware('products.view'));
            $group->post('', LoanProduct\CreateProductAction::class)
                ->add(new RbacMiddleware('products.create'));
            $group->post('/calculate', LoanProduct\CalculateAction::class)
                ->add(new RbacMiddleware('products.view'));
            $group->get('/{id}', LoanProduct\GetProductAction::class)
                ->add(new RbacMiddleware('products.view'));
            $group->put('/{id}', LoanProduct\UpdateProductAction::class)
                ->add(new RbacMiddleware('products.edit'));
        });

        // ─── Loans ───
        $api->group('/loans', function (RouteCollectorProxy $group) {
            $group->get('', Loan\ListLoansAction::class)
                ->add(new RbacMiddleware('loans.view'));
            $group->post('', Loan\CreateLoanAction::class)
                ->add(new RbacMiddleware('loans.create'));
            $group->get('/{id}', Loan\GetLoanAction::class)
                ->add(new RbacMiddleware('loans.view'));
            $group->put('/{id}', Loan\UpdateLoanAction::class)
                ->add(new RbacMiddleware('loans.edit'));
            $group->post('/{id}/submit', Loan\SubmitLoanAction::class)
                ->add(new RbacMiddleware('loans.create'));
            $group->post('/{id}/cancel', Loan\CancelLoanAction::class)
                ->add(new RbacMiddleware('loans.edit'));
            // Used by the underwriter approval form to auto-prefill the
            // top-up balance from the previous loan's outstanding. Gated
            // by loans.view since it only exposes schedule sums the
            // viewer can already see via the regular loan endpoint.
            $group->get('/{id}/previous-outstanding', Loan\GetPreviousOutstandingAction::class)
                ->add(new RbacMiddleware('loans.view'));
        });

        // ─── Approval Workflows ───
        $api->group('/approval-workflows', function (RouteCollectorProxy $group) {
            $group->get('', ApprovalWorkflow\ListWorkflowsAction::class)
                ->add(new RbacMiddleware('products.view'));
            $group->post('', ApprovalWorkflow\CreateWorkflowAction::class)
                ->add(new RbacMiddleware('products.create'));
            $group->get('/{id}', ApprovalWorkflow\GetWorkflowAction::class)
                ->add(new RbacMiddleware('products.view'));
            $group->put('/{id}', ApprovalWorkflow\UpdateWorkflowAction::class)
                ->add(new RbacMiddleware('products.edit'));
            $group->delete('/{id}', ApprovalWorkflow\DeleteWorkflowAction::class)
                ->add(new RbacMiddleware('products.delete'));
        });

        // ─── Approvals ───
        $api->group('/approvals', function (RouteCollectorProxy $group) {
            $group->get('/queue', Approval\ApprovalQueueAction::class)
                ->add(new RbacMiddleware('loans.approve'));
            $group->get('/loan/{id}', Approval\LoanApprovalsAction::class)
                ->add(new RbacMiddleware('loans.view'));
            $group->post('/loan/{id}/decide', Approval\DecideApprovalAction::class)
                ->add(new RbacMiddleware('loans.approve'));
            // Batch: approve/reject many loans in one call. Per-item
            // try/catch; response has success[] + failed[] arrays.
            $group->post('/batch-decide', Approval\BatchDecideApprovalAction::class)
                ->add(new RbacMiddleware('loans.approve'));
        });

        // ─── GL Accounts (Chart of Accounts) ───
        $api->group('/gl-accounts', function (RouteCollectorProxy $group) {
            $group->get('', Accounting\ListGlAccountsAction::class)
                ->add(new RbacMiddleware('accounting.view'));
            $group->post('', Accounting\CreateGlAccountAction::class)
                ->add(new RbacMiddleware('accounting.create'));
            $group->get('/{id}', Accounting\GetGlAccountAction::class)
                ->add(new RbacMiddleware('accounting.view'));
            $group->put('/{id}', Accounting\UpdateGlAccountAction::class)
                ->add(new RbacMiddleware('accounting.edit'));
            $group->get('/{id}/transactions', Accounting\GlTransactionsAction::class)
                ->add(new RbacMiddleware('accounting.view'));
            $group->get('/{id}/summary', Accounting\GlSummaryAction::class)
                ->add(new RbacMiddleware('accounting.view'));
            $group->get('/reports/trial-balance', Accounting\TrialBalanceAction::class)
                ->add(new RbacMiddleware('accounting.view'));
            $group->post('/transactions/{id}/reverse', Accounting\ReversalAction::class)
                ->add(new RbacMiddleware('accounting.edit'));
        });

        // ─── Customer Ledgers ───
        $api->get('/customer-ledgers/{id}/transactions', Accounting\CustomerLedgerTransactionsAction::class)
            ->add(new RbacMiddleware('accounting.view'));

        // ─── Journal Entries ───
        // Global list of every LedgerTransaction with date/account/
        // amount/type filters. Gated by accounting.view since this
        // exposes the full accounting history.
        $api->get('/journal-entries', Accounting\ListJournalEntriesAction::class)
            ->add(new RbacMiddleware('accounting.view'));

        // ─── Accounting — GL Reconciliation Report ───
        // For every CUSTOMER-type parent GL, compares parent-only
        // balance vs sub-ledger aggregate and flags discrepancies.
        // Distinct from /reconciliations (transaction-matching workflow).
        $api->get('/accounting/gl-reconciliation', Accounting\ReconciliationAction::class)
            ->add(new RbacMiddleware('accounting.view'));
        // Drill-in + reassign for orphan postings flagged by the
        // GL Reconciliation report.
        $api->get('/accounting/gl-accounts/{id}/orphan-postings', Accounting\GetOrphanPostingsAction::class)
            ->add(new RbacMiddleware('accounting.view'));
        $api->post('/accounting/transactions/{id}/reassign-ledger', Accounting\ReassignOrphanPostingAction::class)
            ->add(new RbacMiddleware('accounting.edit'));

        // ─── Accounting — Period Close (commit AF) ───
        // List periods + close + reopen. accounting.close gates list +
        // close; reopen uses the same permission (stricter permission
        // can be added later if role structure demands it).
        $api->get('/accounting/periods', Accounting\ListPeriodsAction::class)
            ->add(new RbacMiddleware('accounting.close'));
        $api->post('/accounting/periods/close', Accounting\ClosePeriodAction::class)
            ->add(new RbacMiddleware('accounting.close'));
        $api->post('/accounting/periods/{id}/reopen', Accounting\ReopenPeriodAction::class)
            ->add(new RbacMiddleware('accounting.close'));

        // ─── Accounting — Budgets (commit AH) ───
        // Monthly budget targets per GL account. View gated by
        // accounting.view (all accountants read); create/update/delete
        // gated by accounting.budget (tighter — budget owner only).
        $api->get('/accounting/budgets', Accounting\ListBudgetsAction::class)
            ->add(new RbacMiddleware('accounting.view'));
        $api->post('/accounting/budgets', Accounting\UpsertBudgetAction::class)
            ->add(new RbacMiddleware('accounting.budget'));
        $api->post('/accounting/budgets/rollover', Accounting\BudgetRolloverAction::class)
            ->add(new RbacMiddleware('accounting.budget'));
        $api->delete('/accounting/budgets/{id}', Accounting\DeleteBudgetAction::class)
            ->add(new RbacMiddleware('accounting.budget'));

        // ─── Accounting — Provisions (commit AJ) ───
        // CBN-style loan loss provisioning. Preview is a read-only
        // sandbox; runs post cumulative deltas into the GL. List,
        // detail, reverse round out the lifecycle.
        $api->get('/reports/provisions/preview', Accounting\PreviewProvisionAction::class)
            ->add(new RbacMiddleware('accounting.provision'));
        $api->get('/accounting/provisions/runs', Accounting\ListProvisionRunsAction::class)
            ->add(new RbacMiddleware('accounting.provision'));
        $api->post('/accounting/provisions/runs', Accounting\RunProvisionAction::class)
            ->add(new RbacMiddleware('accounting.provision'));
        $api->get('/accounting/provisions/runs/{id}', Accounting\GetProvisionRunAction::class)
            ->add(new RbacMiddleware('accounting.provision'));
        $api->post('/accounting/provisions/runs/{id}/reverse', Accounting\ReverseProvisionRunAction::class)
            ->add(new RbacMiddleware('accounting.provision'));

        // ─── Repayment Schedule ───
        $api->get('/loans/{loanId}/repayment-schedule', Accounting\RepaymentScheduleAction::class)
            ->add(new RbacMiddleware('loans.view'));

        // ─── Loan Customer Ledger ───
        // Returns the CustomerLedger + all LedgerTransactions for a loan.
        // Used by the loan-detail 'Ledger' tab to show the full accounting
        // trail (gross CR, fee DRs, net DR, repayments, reversals).
        // Gated by accounting.view since this exposes financial postings.
        $api->get('/loans/{id}/customer-ledger', Loan\LoanCustomerLedgerAction::class)
            ->add(new RbacMiddleware('accounting.view'));

        // ─── Disbursement ───
        $api->get('/loans/{id}/disbursement-preview', Disbursement\DisbursementPreviewAction::class)
            ->add(new RbacMiddleware('loans.disburse'));
        $api->get('/disbursement-queue', Disbursement\DisbursementQueueAction::class)
            ->add(new RbacMiddleware('loans.disburse'));
        $api->post('/loans/{id}/disburse', Disbursement\DisburseLoanAction::class)
            ->add(new RbacMiddleware('loans.disburse'));
        // Batch disburse: all loans funded from same settlement GL on
        // same effective date. Top-up auto-detected per loan.
        $api->post('/disbursement/batch', Disbursement\BatchDisburseAction::class)
            ->add(new RbacMiddleware('loans.disburse'));

        // ─── Maker-Checker ───
        $api->group('/maker-checker', function (RouteCollectorProxy $group) {
            $group->get('', MakerChecker\ListMcRequestsAction::class)
                ->add(new RbacMiddleware('maker_checker.check'));
            $group->post('/{id}/decide', MakerChecker\DecideMcAction::class)
                ->add(new RbacMiddleware('maker_checker.check'));
            // Batch: approve/reject many MC requests in one call.
            // Per-item transaction for approve path (matches single).
            $group->post('/batch-decide', MakerChecker\BatchDecideMcAction::class)
                ->add(new RbacMiddleware('maker_checker.check'));
        });

        // ─── Payments ───
        $api->group('/payments', function (RouteCollectorProxy $group) {
            $group->get('', Payment\ListPaymentsAction::class)
                ->add(new RbacMiddleware('payments.view'));
            $group->post('/repayment', Payment\PostRepaymentAction::class)
                ->add(new RbacMiddleware('payments.create'));
            $group->post('/bulk-upload', Payment\BulkRepaymentAction::class)
                ->add(new RbacMiddleware('payments.bulk_upload'));
        });

        // ─── Penalty Rules ───
        $api->group('/penalty-rules', function (RouteCollectorProxy $group) {
            $group->get('', Penalty\ListPenaltyRulesAction::class)
                ->add(new RbacMiddleware('products.view'));
            $group->post('', Penalty\CreatePenaltyRuleAction::class)
                ->add(new RbacMiddleware('products.create'));
            $group->put('/{id}', Penalty\UpdatePenaltyRuleAction::class)
                ->add(new RbacMiddleware('products.edit'));
        });

        // ─── Loan Lifecycle (write-off, restructure) ───
        $api->post('/loans/{id}/write-off', Loan\WriteOffLoanAction::class)
            ->add(new RbacMiddleware('loans.write_off'));
        $api->post('/loans/{id}/restructure', Loan\RestructureLoanAction::class)
            ->add(new RbacMiddleware('loans.restructure'));

        // ─── Notification Templates ───
        $api->group('/notification-templates', function (RouteCollectorProxy $group) {
            $group->get('', Notification\ListTemplatesAction::class)
                ->add(new RbacMiddleware('notifications.manage'));
            $group->post('', Notification\CreateTemplateAction::class)
                ->add(new RbacMiddleware('notifications.manage'));
            $group->put('/{id}', Notification\UpdateTemplateAction::class)
                ->add(new RbacMiddleware('notifications.manage'));
        });

        // ─── User Notifications (in-app) ───
        $api->group('/notifications', function (RouteCollectorProxy $group) {
            $group->get('', Notification\UserNotificationsAction::class)
                ->add(new RbacMiddleware('notifications.view'));
            $group->post('/mark-read', Notification\MarkNotificationsReadAction::class)
                ->add(new RbacMiddleware('notifications.view'));
        });

        // ─── Messaging (Agent ↔ Backoffice) ───
        $api->group('/conversations', function (RouteCollectorProxy $group) {
            $group->get('', Messaging\ListConversationsAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->post('', Messaging\CreateConversationAction::class)
                ->add(new RbacMiddleware('messaging.send'));
            $group->get('/{id}', Messaging\GetConversationAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->get('/{id}/messages', Messaging\GetConversationMessagesAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->post('/{id}/messages', Messaging\SendMessageAction::class)
                ->add(new RbacMiddleware('messaging.send'));
            $group->post('/{id}/read', Messaging\MarkConversationReadAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->post('/{id}/resolve', Messaging\ResolveConversationAction::class)
                ->add(new RbacMiddleware('messaging.send'));
        });

        // ─── Channels & Groups ───
        $api->group('/channels', function (RouteCollectorProxy $group) {
            $group->get('', Channel\ListChannelsAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->post('', Channel\CreateChannelAction::class)
                ->add(new RbacMiddleware('messaging.send'));
            $group->patch('/{id}', Channel\UpdateChannelAction::class)
                ->add(new RbacMiddleware('messaging.send'));
            $group->get('/{id}/messages', Channel\GetChannelMessagesAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->post('/{id}/messages', Channel\SendChannelMessageAction::class)
                ->add(new RbacMiddleware('messaging.send'));
            $group->get('/{id}/members', Channel\GetChannelMembersAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->post('/{id}/members', Channel\AddChannelMembersAction::class)
                ->add(new RbacMiddleware('messaging.send'));
            $group->delete('/{id}/members/{userId}', Channel\RemoveChannelMemberAction::class)
                ->add(new RbacMiddleware('messaging.send'));
            $group->post('/{id}/mark-read', Channel\MarkChannelReadAction::class)
                ->add(new RbacMiddleware('messaging.view'));
            $group->patch('/{id}/member-settings', Channel\UpdateMemberSettingsAction::class)
                ->add(new RbacMiddleware('messaging.view'));
        });

        // ─── Unread Count ───
        $api->get('/messaging/unread-count', Channel\UnreadCountAction::class)
            ->add(new RbacMiddleware('messaging.view'));

        // ─── Device Tokens (Push Notifications) ───
        $api->post('/devices/register', Device\RegisterDeviceAction::class);
        $api->post('/devices/unregister', Device\UnregisterDeviceAction::class);
        $api->post('/notifications/push', Device\SendNotificationAction::class)
            ->add(new RbacMiddleware('notifications.manage'));

        // ─── Reports ───
        $api->group('/reports', function (RouteCollectorProxy $group) {
            $group->get('/portfolio', Report\PortfolioDashboardAction::class)
                ->add(new RbacMiddleware('reports.portfolio'));
            $group->get('/par', Report\ParReportAction::class)
                ->add(new RbacMiddleware('reports.par'));
            $group->get('/agent-performance', Report\AgentPerformanceAction::class)
                ->add(new RbacMiddleware('reports.performance.agents'));
            $group->get('/branch-performance', Report\BranchPerformanceAction::class)
                ->add(new RbacMiddleware('reports.performance.branches'));
            $group->get('/product-performance', Report\ProductPerformanceAction::class)
                ->add(new RbacMiddleware('reports.performance.products'));
            $group->get('/approver-performance', Report\ApproverPerformanceAction::class)
                ->add(new RbacMiddleware('reports.performance.approvers'));
            $group->get('/receivables', Report\ReceivablesReportAction::class)
                ->add(new RbacMiddleware('reports.portfolio'));
            $group->get('/closed-loans', Report\ClosedLoansReportAction::class)
                ->add(new RbacMiddleware('reports.portfolio'));
            $group->get('/repayment', Report\RepaymentPerformanceAction::class)
                ->add(new RbacMiddleware('reports.portfolio'));
            $group->get('/collection', Report\CollectionEfficiencyAction::class)
                ->add(new RbacMiddleware('reports.portfolio'));
            $group->get('/cbn/portfolio', Report\CbnPortfolioReportAction::class)
                ->add(new RbacMiddleware('reports.cbn'));
            $group->get('/cbn/npl', Report\CbnNplReportAction::class)
                ->add(new RbacMiddleware('reports.cbn'));
            $group->get('/cbn/aging', Report\CbnAgingReportAction::class)
                ->add(new RbacMiddleware('reports.cbn'));

            // ─── CBN Regulatory Returns (commit AG) ───
            // Four production-grade returns suitable for CBN submission:
            //   - CRMS (Credit Risk Management System) — every live loan
            //     with borrower BVN/NIN/details.
            //   - NPL Schedule — non-performing loans (90+ DPD) with
            //     provisioning category and estimated provision.
            //   - Insider-Related Credit — loans to directors/employees/
            //     affiliated parties flagged via Customer.is_insider.
            //   - Monthly Returns — aggregate portfolio metrics for a
            //     given month (new disbursements, repayments, PAR, NPL).
            // The existing /cbn/portfolio, /cbn/npl, /cbn/aging (basic
            // scaffolds from earlier) are left in place for backward
            // compatibility.
            $group->get('/cbn/crms-returns', Report\CrmsReturnsAction::class)
                ->add(new RbacMiddleware('reports.cbn'));
            $group->get('/cbn/npl-schedule', Report\NplScheduleAction::class)
                ->add(new RbacMiddleware('reports.cbn'));
            $group->get('/cbn/insider-related', Report\InsiderRelatedCreditAction::class)
                ->add(new RbacMiddleware('reports.cbn'));
            $group->get('/cbn/monthly-returns', Report\MonthlyReturnsAction::class)
                ->add(new RbacMiddleware('reports.cbn'));
            $group->get('/customer-variance', Report\CustomerVarianceReportAction::class)
                ->add(new RbacMiddleware('reports.portfolio'));

            // ─── Financial Statements ───
            // Income Statement (P&L) — revenue - expenses over a period.
            // Balance Sheet — Assets / Liabilities / Equity snapshot.
            // Gated by accounting.view to match the other accounting
            // reports (Chart of Accounts, Journal Entries, GL Reconciliation).
            $group->get('/income-statement', Report\IncomeStatementAction::class)
                ->add(new RbacMiddleware('accounting.view'));
            $group->get('/balance-sheet', Report\BalanceSheetAction::class)
                ->add(new RbacMiddleware('accounting.view'));

            // ─── Aged Receivables + PAR (commit AE) ───
            // Aged Receivables: installment-level buckets for collections.
            // Portfolio At Risk: loan-level PAR30/60/90 for risk mgmt.
            $group->get('/aged-receivables', Report\AgedReceivablesAction::class)
                ->add(new RbacMiddleware('accounting.view'));
            $group->get('/portfolio-at-risk', Report\PortfolioAtRiskAction::class)
                ->add(new RbacMiddleware('reports.par'));

            // ─── Budget vs Actual (commit AH) ───
            // Compares budgeted amounts (from budgets table) against
            // actual posted activity for a given month. Income and
            // expense shown separately with per-account variance.
            $group->get('/budget-vs-actual', Report\BudgetVsActualAction::class)
                ->add(new RbacMiddleware('accounting.view'));
        });

        // ─── Reconciliation ───
        $api->group('/reconciliations', function (RouteCollectorProxy $group) {
            $group->get('', Reconciliation\ListReconciliationsAction::class)
                ->add(new RbacMiddleware('reports.reconciliation'));
            $group->post('', Reconciliation\RunReconciliationAction::class)
                ->add(new RbacMiddleware('reports.reconciliation'));
            $group->get('/{id}', Reconciliation\GetReconciliationAction::class)
                ->add(new RbacMiddleware('reports.reconciliation'));
            $group->post('/{id}/resolve', Reconciliation\ResolveReconciliationAction::class)
                ->add(new RbacMiddleware('reports.reconciliation'));
            // AK — per-item actions + candidate search
            $group->get('/{id}/available-matches', Reconciliation\GetAvailableMatchesAction::class)
                ->add(new RbacMiddleware('reports.reconciliation'));
            $group->post('/{id}/items/{itemId}/manual-match', Reconciliation\ManualMatchItemAction::class)
                ->add(new RbacMiddleware('reports.reconciliation'));
            $group->post('/{id}/items/{itemId}/resolve', Reconciliation\ResolveItemAction::class)
                ->add(new RbacMiddleware('reports.reconciliation'));
        });

        // ─── DSA Targets ───
        $api->group('/dsa-targets', function (RouteCollectorProxy $group) {
            $group->get('', DsaTarget\ListDsaTargetsAction::class)
                ->add(new RbacMiddleware('reports.performance'));
            $group->post('', DsaTarget\CreateDsaTargetAction::class)
                ->add(new RbacMiddleware('reports.performance'));
        });

        // ─── Departments ───
        $api->group('/departments', function (RouteCollectorProxy $group) {
            $group->get('', Department\ListDepartmentsAction::class);
            $group->post('', Department\CreateDepartmentAction::class)
                ->add(new RbacMiddleware('users.create'));
            $group->put('/{id}', Department\UpdateDepartmentAction::class)
                ->add(new RbacMiddleware('users.edit'));
        });

        // ─── Teams ───
        $api->group('/teams', function (RouteCollectorProxy $group) {
            $group->get('', Team\ListTeamsAction::class);
            $group->post('', Team\CreateTeamAction::class)
                ->add(new RbacMiddleware('users.create'));
            $group->put('/{id}', Team\UpdateTeamAction::class)
                ->add(new RbacMiddleware('users.edit'));
        });

    })->add(new AuthMiddleware($app->getContainer()->get(JwtService::class)));
};
