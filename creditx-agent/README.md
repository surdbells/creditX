# CreditX Agent — Ionic Angular

Field agent mobile app for loan origination and capture.

## Setup

```bash
npm install
ionic serve
```

App runs at `http://localhost:8100`.

## Build

```bash
ionic build --prod
```

## Native Builds

```bash
ionic capacitor add android
ionic capacitor add ios
ionic capacitor build android
ionic capacitor build ios
```

## Project Structure

```
src/app/
├── core/
│   ├── guards/         # Auth guards
│   ├── interceptors/   # JWT HTTP interceptor
│   ├── models/         # Shared TypeScript interfaces
│   └── services/       # Auth service
├── pages/
│   ├── auth/           # Login page
│   ├── dashboard/      # Agent dashboard
│   ├── loans/          # Loan capture & tracking (Phase 10)
│   └── messages/       # Agent-backoffice messaging (Phase 10)
└── environments/       # Dev & prod configs
```
