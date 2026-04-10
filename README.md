# CreditX v2.0 — Loan Management System

A comprehensive, production-grade loan management platform for Nigerian lending companies.

## Monorepo Structure

```
creditx/
├── backend/          # Slim 4 + Doctrine ORM 3 + PostgreSQL 16 API
├── creditx-admin/    # Angular 21 Admin Dashboard
├── creditx-agent/    # Ionic Angular Agent Mobile App
└── docs/             # Documentation
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Slim 4, PHP 8.3+, Doctrine ORM 3, PostgreSQL 16 |
| Auth | firebase/php-jwt |
| Queue | Symfony Messenger + Redis |
| Cache | Redis (predis) |
| Email | ZeptoMail |
| SMS | Termii |
| Payments | Paystack |
| Files | Flysystem |
| PDF | Dompdf |
| API Docs | swagger-php (OpenAPI 3.1) |
| WebSocket | Ratchet / Node.js sidecar |
| Admin UI | Angular 21 |
| Agent App | Ionic Angular (Capacitor) |

## Getting Started

See individual project READMEs:
- [Backend](./backend/README.md)
- [Admin](./creditx-admin/README.md)
- [Agent](./creditx-agent/README.md)

## License

Proprietary — Kodek Innovations Limited
