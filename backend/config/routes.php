<?php

declare(strict_types=1);

use App\Action\Auth;
use App\Action\User;
use App\Action\Location;
use App\Action\Role;
use App\Action\Setting;
use App\Action\Audit;
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

    })->add(new AuthMiddleware($app->getContainer()->get(JwtService::class)));
};
