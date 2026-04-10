# CreditX Admin — Angular 21

Admin dashboard for the CreditX Loan Management System.

## Setup

```bash
npm install
ng serve
```

App runs at `http://localhost:4200`.

## Build

```bash
ng build
```

Production output in `dist/creditx-admin/browser/`.

## Deployment

Deployed via Cloudflare Pages. Build command: `ng build`, output directory: `dist/creditx-admin/browser`.

## Project Structure

```
src/app/
├── core/
│   ├── guards/         # Auth & permission guards
│   ├── interceptors/   # JWT HTTP interceptor
│   ├── models/         # TypeScript interfaces
│   └── services/       # Auth service, API services
├── features/
│   ├── auth/           # Login
│   ├── dashboard/      # Dashboard
│   └── layout/         # Sidebar + top bar layout
├── shared/
│   └── components/     # Reusable UI components
└── environments/       # Dev & prod configs
```
