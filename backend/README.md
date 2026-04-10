# CreditX v2.0 — Backend API

Slim 4 + Doctrine ORM 3 + PostgreSQL 16 REST API.

## Requirements

- PHP 8.3+
- PostgreSQL 16
- Redis 7+
- Composer

## Setup

```bash
# Install dependencies
composer install

# Configure environment
cp .env.example .env
# Edit .env with your database/redis credentials

# Run database migrations
php vendor/bin/doctrine-migrations migrate --configuration=config/migrations.php --db-configuration=config/cli-config.php

# Seed default data (roles, permissions, settings, admin user)
php bin/seed.php

# Start development server
composer serve
# API available at http://localhost:8080
```

## Default Admin Credentials

- Email: `admin@creditx.com`
- Password: `Admin@123456`

## API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh token
- `POST /api/auth/logout` — Logout (auth required)
- `GET  /api/auth/me` — Current user profile (auth required)
- `POST /api/auth/change-password` — Change password (auth required)

### Users
- `GET    /api/users` — List users
- `POST   /api/users` — Create user
- `GET    /api/users/{id}` — Get user
- `PUT    /api/users/{id}` — Update user

### Roles & Permissions
- `GET    /api/roles` — List roles
- `POST   /api/roles` — Create role
- `GET    /api/roles/{id}` — Get role
- `PUT    /api/roles/{id}` — Update role
- `GET    /api/permissions` — List all permissions (grouped by module)

### Locations
- `GET    /api/locations` — List locations
- `POST   /api/locations` — Create location
- `GET    /api/locations/{id}` — Get location
- `PUT    /api/locations/{id}` — Update location

### Settings
- `GET    /api/settings` — List settings
- `POST   /api/settings` — Create setting
- `GET    /api/settings/{id}` — Get setting
- `PUT    /api/settings/{id}` — Update setting
- `DELETE /api/settings/{id}` — Delete setting

### Audit Logs
- `GET    /api/audit-logs` — List audit logs

### Health
- `GET    /api/health` — Health check

## Project Structure

```
backend/
├── bin/                  # CLI scripts (seed, etc.)
├── config/               # Container, middleware, routes, doctrine config
├── database/migrations/  # Doctrine migrations
├── public/               # Web entry point (index.php)
├── src/
│   ├── Action/           # HTTP controllers (Auth, User, Role, Location, Setting, Audit)
│   ├── Domain/
│   │   ├── Entity/       # Doctrine entities
│   │   ├── Enum/         # PHP enums
│   │   ├── Exception/    # Domain exceptions
│   │   └── Repository/   # Data access repositories
│   └── Infrastructure/
│       ├── Logger/       # Monolog setup
│       ├── Middleware/   # Auth, CORS, RBAC, RateLimit, JSON parser
│       ├── Persistence/  # Doctrine factory, custom types
│       ├── Queue/        # Symfony Messenger (future)
│       └── Service/      # JWT, Redis, Password, Audit, Settings cache, Validation
├── storage/              # File uploads and exports
├── tests/                # PHPUnit tests
└── var/                  # Cache, logs, proxies (gitignored)
```
