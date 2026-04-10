<?php

declare(strict_types=1);

use App\Action\Auth;
use App\Action\User;
use App\Action\Location;
use App\Action\Role;
use App\Action\Setting;
use App\Action\Audit;
use App\Action\RecordType;
use App\Action\GovRecord;
use App\Action\Customer;
use App\Action\Document;
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
        $group->post('/refresh', Auth\RefreshTokenAction::class);
    });

    // ─── Authenticated routes ───
    $app->group('/api', function (RouteCollectorProxy $api) {

        // Auth (authenticated)
        $api->group('/auth', function (RouteCollectorProxy $group) {
            $group->post('/logout', Auth\LogoutAction::class);
            $group->get('/me', Auth\MeAction::class);
            $group->post('/change-password', Auth\ChangePasswordAction::class);
        });

        // ─── Users ───
        $api->group('/users', function (RouteCollectorProxy $group) {
            $group->get('', User\ListUsersAction::class)
                ->add(new RbacMiddleware('users.view'));
            $group->post('', User\CreateUserAction::class)
                ->add(new RbacMiddleware('users.create'));
            $group->get('/{id}', User\GetUserAction::class)
                ->add(new RbacMiddleware('users.view'));
            $group->put('/{id}', User\UpdateUserAction::class)
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

    })->add(new AuthMiddleware($app->getContainer()->get(JwtService::class)));
};
