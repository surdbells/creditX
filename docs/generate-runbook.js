const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
        LevelFormat, PageBreak, Header, Footer, PageNumber } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };
const tableWidth = 9360;

const GREEN = "0A4F2A";
const GOLD = "C9A227";
const LIGHT_GREEN = "E8F5EE";
const LIGHT_GRAY = "F4F6F8";

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, children: [new TextRun({ text, bold: true })] });
}

function para(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, size: 22, ...opts })] });
}

function boldPara(label, value) {
  return new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: label, bold: true, size: 22 }),
    new TextRun({ text: value, size: 22 }),
  ]});
}

function codePara(text) {
  return new Paragraph({ spacing: { after: 60, before: 60 }, indent: { left: 360 }, children: [
    new TextRun({ text, font: "Courier New", size: 18 }),
  ]});
}

function bulletItem(text, ref = "bullets") {
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, size: 22 })] });
}

function tableRow(cells, header = false) {
  return new TableRow({
    children: cells.map((text, i) => new TableCell({
      borders, cellMargins,
      width: { size: Math.floor(tableWidth / cells.length), type: WidthType.DXA },
      shading: header ? { fill: GREEN, type: ShadingType.CLEAR } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: String(text), size: 20, bold: header, color: header ? "FFFFFF" : "1A1A2E" })] })],
    })),
  });
}

function makeTable(headers, rows) {
  const colCount = headers.length;
  const colWidth = Math.floor(tableWidth / colCount);
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: Array(colCount).fill(colWidth),
    rows: [tableRow(headers, true), ...rows.map(r => tableRow(r))],
  });
}

function sectionBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ─── BUILD DOCUMENT ───
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: GREEN }, paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: GREEN }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" }, paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [
    // ─── COVER PAGE ───
    {
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({ spacing: { before: 3000 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "CREDITX v2.0", size: 56, bold: true, color: GREEN }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
          new TextRun({ text: "LOAN MANAGEMENT SYSTEM", size: 32, color: GOLD }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [
          new TextRun({ text: "Deployment Runbook & Phase 11 Documentation", size: 24, color: "64748B" }),
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Prepared by Kodek Innovations Limited", size: 22 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "April 2026", size: 22, color: "64748B" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CONFIDENTIAL", size: 20, bold: true, color: "DC2626" })] }),
        sectionBreak(),

        // ─── TABLE OF CONTENTS ───
        heading("Table of Contents"),
        para("1. System Overview"),
        para("2. Prerequisites & Infrastructure"),
        para("3. Server Setup (aaPanel)"),
        para("4. Database Setup (PostgreSQL 16)"),
        para("5. Backend Deployment (Slim 4 / PHP 8.3)"),
        para("6. Redis Setup"),
        para("7. Admin Frontend Deployment (Angular 21 / Cloudflare)"),
        para("8. Agent Mobile App Build (Ionic / Capacitor)"),
        para("9. Queue Workers & Scheduled Jobs"),
        para("10. Data Migration (MySQL → PostgreSQL)"),
        para("11. SSL & Security Hardening"),
        para("12. Monitoring & Health Checks"),
        para("13. Backup & Disaster Recovery"),
        para("14. Rollback Procedures"),
        para("15. Appendix: Environment Variables"),
        sectionBreak(),

        // ─── 1. SYSTEM OVERVIEW ───
        heading("1. System Overview"),
        para("CreditX v2.0 is a ground-up rebuild of the loan management system, comprising three applications deployed as a unified platform:"),
        makeTable(
          ["Component", "Technology", "Deployment"],
          [
            ["Backend API", "Slim 4 + Doctrine ORM 3 + PostgreSQL 16", "aaPanel (Nginx + PHP-FPM)"],
            ["Admin Frontend", "Angular 21 (standalone components)", "Cloudflare Pages"],
            ["Agent Mobile App", "Ionic Angular + Capacitor", "Google Play / Apple App Store"],
          ]
        ),
        para(""),
        boldPara("Repository: ", "https://github.com/surdbells/creditX"),
        boldPara("Monorepo structure: ", "backend/ | creditx-admin/ | creditx-agent/"),
        boldPara("Total codebase: ", "259 PHP files, 44 Angular TS files, 20 Ionic TS files"),
        boldPara("API endpoints: ", "~118 REST endpoints"),
        boldPara("Database entities: ", "44 Doctrine entities, 31 enums"),
        boldPara("Default admin: ", "admin@creditx.com / Admin@123456"),
        sectionBreak(),

        // ─── 2. PREREQUISITES ───
        heading("2. Prerequisites & Infrastructure"),
        heading("2.1 Server Requirements", HeadingLevel.HEADING_2),
        makeTable(
          ["Resource", "Minimum", "Recommended"],
          [
            ["CPU", "2 vCPU", "4 vCPU"],
            ["RAM", "4 GB", "8 GB"],
            ["Storage", "40 GB SSD", "100 GB SSD"],
            ["OS", "Ubuntu 22.04 / 24.04 LTS", "Ubuntu 24.04 LTS"],
            ["Bandwidth", "100 Mbps", "1 Gbps"],
          ]
        ),
        para(""),
        heading("2.2 Software Requirements", HeadingLevel.HEADING_2),
        bulletItem("PHP 8.3+ with extensions: pdo_pgsql, mbstring, curl, json, redis, zip, gd, bcmath"),
        bulletItem("PostgreSQL 16"),
        bulletItem("Redis 7+"),
        bulletItem("Nginx (via aaPanel)"),
        bulletItem("Composer 2.x"),
        bulletItem("Node.js 20+ and npm 10+ (for frontend builds)"),
        bulletItem("Git"),
        bulletItem("Supervisor (for queue workers)"),
        sectionBreak(),

        // ─── 3. SERVER SETUP ───
        heading("3. Server Setup (aaPanel)"),
        para("The server has aaPanel installed. Use the aaPanel web interface for initial setup."),
        heading("3.1 Install Required Software via aaPanel", HeadingLevel.HEADING_2),
        bulletItem("Software Store → Install: Nginx, PHP 8.3, PostgreSQL 16, Redis"),
        bulletItem("PHP 8.3 → Install extensions: pdo_pgsql, redis, bcmath, gd, zip, mbstring"),
        bulletItem("PHP 8.3 → Disable functions: remove exec, shell_exec, proc_open from disabled list (needed for Composer)"),
        heading("3.2 Create Website in aaPanel", HeadingLevel.HEADING_2),
        codePara("Domain: api.creditx.com"),
        codePara("Root directory: /www/wwwroot/creditx/backend/public"),
        codePara("PHP version: 8.3"),
        para(""),
        heading("3.3 Nginx Configuration", HeadingLevel.HEADING_2),
        para("Replace the default aaPanel site config with:"),
        codePara("server {"),
        codePara("    listen 80;"),
        codePara("    server_name api.creditx.com;"),
        codePara("    root /www/wwwroot/creditx/backend/public;"),
        codePara("    index index.php;"),
        codePara(""),
        codePara("    location / {"),
        codePara("        try_files $uri $uri/ /index.php$is_args$args;"),
        codePara("    }"),
        codePara(""),
        codePara("    location ~ \\.php$ {"),
        codePara("        fastcgi_pass unix:/tmp/php-cgi-83.sock;"),
        codePara("        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;"),
        codePara("        include fastcgi_params;"),
        codePara("    }"),
        codePara(""),
        codePara("    client_max_body_size 50M;"),
        codePara("}"),
        sectionBreak(),

        // ─── 4. DATABASE ───
        heading("4. Database Setup (PostgreSQL 16)"),
        codePara("sudo -u postgres psql"),
        codePara("CREATE DATABASE creditx_db;"),
        codePara("CREATE USER creditx_user WITH PASSWORD 'STRONG_PASSWORD_HERE';"),
        codePara("GRANT ALL PRIVILEGES ON DATABASE creditx_db TO creditx_user;"),
        codePara("ALTER DATABASE creditx_db OWNER TO creditx_user;"),
        codePara("\\q"),
        sectionBreak(),

        // ─── 5. BACKEND DEPLOYMENT ───
        heading("5. Backend Deployment"),
        heading("5.1 Clone and Install", HeadingLevel.HEADING_2),
        codePara("cd /www/wwwroot"),
        codePara("git clone https://github.com/surdbells/creditX.git creditx"),
        codePara("cd creditx/backend"),
        codePara("composer install --no-dev --optimize-autoloader"),
        heading("5.2 Environment Configuration", HeadingLevel.HEADING_2),
        codePara("cp .env.example .env"),
        codePara("nano .env"),
        para("Set all required values (see Appendix for full variable reference)."),
        heading("5.3 Database Schema Creation", HeadingLevel.HEADING_2),
        codePara("php bin/doctrine orm:schema-tool:create"),
        heading("5.4 Seed Default Data", HeadingLevel.HEADING_2),
        codePara("php bin/seed.php"),
        para("Seeds: 55 permissions, 8 roles, 21 system settings, 5 fee types, 13 GL accounts, super admin user."),
        heading("5.5 Set Permissions", HeadingLevel.HEADING_2),
        codePara("chown -R www:www /www/wwwroot/creditx/backend"),
        codePara("chmod -R 755 /www/wwwroot/creditx/backend"),
        codePara("chmod -R 775 /www/wwwroot/creditx/backend/storage"),
        heading("5.6 Verify", HeadingLevel.HEADING_2),
        codePara("curl -s http://api.creditx.com/api/health | jq ."),
        codePara("# Expected: {\"status\":\"ok\"}"),
        sectionBreak(),

        // ─── 6. REDIS ───
        heading("6. Redis Setup"),
        para("Redis is used for JWT token blacklisting, settings cache, rate limiting, and Symfony Messenger queue transport."),
        codePara("redis-cli ping"),
        codePara("# Expected: PONG"),
        para("Set Redis password in .env:"),
        codePara("REDIS_HOST=127.0.0.1"),
        codePara("REDIS_PORT=6379"),
        codePara("REDIS_PASSWORD=your_redis_password"),
        sectionBreak(),

        // ─── 7. ADMIN FRONTEND ───
        heading("7. Admin Frontend Deployment (Cloudflare Pages)"),
        heading("7.1 Build", HeadingLevel.HEADING_2),
        codePara("cd /www/wwwroot/creditx/creditx-admin"),
        codePara("npm ci"),
        codePara("npx ng build --configuration production"),
        codePara("# Output: dist/creditx-admin/browser/"),
        heading("7.2 Deploy to Cloudflare Pages", HeadingLevel.HEADING_2),
        bulletItem("Login to Cloudflare Dashboard → Pages → Create project"),
        bulletItem("Connect GitHub repository: surdbells/creditX"),
        bulletItem("Build settings: Framework = None, Build command = cd creditx-admin && npm ci && npx ng build --configuration production, Output directory = creditx-admin/dist/creditx-admin/browser"),
        bulletItem("Environment variables: Set API_URL = https://api.creditx.com/api"),
        bulletItem("Custom domain: admin.creditx.com"),
        heading("7.3 Environment File", HeadingLevel.HEADING_2),
        para("Update src/environments/environment.prod.ts before build:"),
        codePara("export const environment = {"),
        codePara("  production: true,"),
        codePara("  apiUrl: 'https://api.creditx.com/api',"),
        codePara("};"),
        sectionBreak(),

        // ─── 8. AGENT APP ───
        heading("8. Agent Mobile App Build"),
        heading("8.1 Web Build", HeadingLevel.HEADING_2),
        codePara("cd /www/wwwroot/creditx/creditx-agent"),
        codePara("npm ci"),
        codePara("npx ng build --configuration production"),
        heading("8.2 Android Build", HeadingLevel.HEADING_2),
        codePara("npx cap add android"),
        codePara("npx cap sync"),
        codePara("npx cap open android"),
        para("Build signed APK/AAB from Android Studio for Play Store submission."),
        heading("8.3 iOS Build", HeadingLevel.HEADING_2),
        codePara("npx cap add ios"),
        codePara("npx cap sync"),
        codePara("npx cap open ios"),
        para("Build from Xcode for App Store submission (requires macOS + Apple Developer account)."),
        sectionBreak(),

        // ─── 9. QUEUE WORKERS ───
        heading("9. Queue Workers & Scheduled Jobs"),
        heading("9.1 Supervisor Configuration", HeadingLevel.HEADING_2),
        codePara("# /etc/supervisor/conf.d/creditx-worker.conf"),
        codePara("[program:creditx-worker]"),
        codePara("command=php /www/wwwroot/creditx/backend/bin/console messenger:consume async --time-limit=3600"),
        codePara("user=www"),
        codePara("numprocs=2"),
        codePara("autostart=true"),
        codePara("autorestart=true"),
        codePara("stderr_logfile=/var/log/creditx-worker.err.log"),
        codePara("stdout_logfile=/var/log/creditx-worker.out.log"),
        para(""),
        codePara("sudo supervisorctl reread && sudo supervisorctl update"),
        codePara("sudo supervisorctl start creditx-worker:*"),
        heading("9.2 Cron Jobs (Scheduled Tasks)", HeadingLevel.HEADING_2),
        codePara("# /etc/crontab or aaPanel Cron Manager"),
        codePara(""),
        codePara("# Overdue detection + penalty application (daily at 1:00 AM)"),
        codePara("0 1 * * * php /www/wwwroot/creditx/backend/bin/overdue-check.php"),
        codePara(""),
        codePara("# SLA breach processing (every 30 minutes)"),
        codePara("*/30 * * * * php /www/wwwroot/creditx/backend/bin/sla-check.php"),
        codePara(""),
        codePara("# Report schedule runner (daily at 6:00 AM)"),
        codePara("0 6 * * * php /www/wwwroot/creditx/backend/bin/report-schedule.php"),
        sectionBreak(),

        // ─── 10. DATA MIGRATION ───
        heading("10. Data Migration (MySQL → PostgreSQL)"),
        heading("10.1 Migration Order", HeadingLevel.HEADING_2),
        makeTable(
          ["#", "Source (MySQL)", "Target (PostgreSQL)", "Notes"],
          [
            ["1", "N/A", "record_types", "Seed 4 types: IPPIS, TESCOM, LASG, SUBEB"],
            ["2", "ippis_tbl, tescom_tbl, lasg_tbl, subeb_tbl", "government_records", "Unified with record_type_id FK"],
            ["3", "customers", "customers", "Map fields, deduplicate by staff_id/BVN"],
            ["4", "user", "users", "Map roles to new RBAC, preserve bcrypt hashes"],
            ["5", "general_ledgers", "general_ledgers", "Map account codes, verify hierarchy"],
            ["6", "loans, loan_trans", "loans, loan_transactions", "Map status to 13-state machine"],
            ["7", "ledger_trans, customer_accounts", "ledger_transactions, customer_ledgers", "Verify DR=CR balance"],
          ]
        ),
        heading("10.2 Migration Script", HeadingLevel.HEADING_2),
        codePara("php bin/migrate-from-mysql.php"),
        para("The script connects to both databases, transforms data, handles duplicate detection, and generates a verification report."),
        heading("10.3 Verification Checklist", HeadingLevel.HEADING_2),
        bulletItem("Row counts match source for all tables"),
        bulletItem("All staff_id values from source exist in government_records"),
        bulletItem("All customer BVNs are unique (no duplicates)"),
        bulletItem("Total DR = Total CR in ledger_transactions"),
        bulletItem("All loans have valid customer_id and product_id references"),
        bulletItem("Admin user can login with existing credentials"),
        sectionBreak(),

        // ─── 11. SSL ───
        heading("11. SSL & Security Hardening"),
        bulletItem("aaPanel → Website → SSL → Apply Let's Encrypt certificate for api.creditx.com"),
        bulletItem("Force HTTPS redirect in Nginx config"),
        bulletItem("Set security headers: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security"),
        bulletItem("Review and lock CORS origins in .env (CORS_ORIGIN=https://admin.creditx.com)"),
        bulletItem("Ensure all .env secrets use strong randomly generated values"),
        bulletItem("Disable PHP display_errors in production"),
        bulletItem("Set APP_ENV=production in .env"),
        bulletItem("Rate limiting: configured via Redis middleware (100 req/min per IP)"),
        sectionBreak(),

        // ─── 12. MONITORING ───
        heading("12. Monitoring & Health Checks"),
        heading("12.1 Health Endpoint", HeadingLevel.HEADING_2),
        codePara("GET /api/health → {\"status\": \"ok\", \"database\": \"connected\", \"redis\": \"connected\"}"),
        heading("12.2 Log Files", HeadingLevel.HEADING_2),
        makeTable(
          ["Log", "Location", "Purpose"],
          [
            ["PHP errors", "/www/wwwroot/creditx/backend/storage/logs/app.log", "Application errors"],
            ["Nginx access", "/www/wwwlogs/api.creditx.com.log", "HTTP request log"],
            ["Nginx errors", "/www/wwwlogs/api.creditx.com.error.log", "Nginx errors"],
            ["Queue worker", "/var/log/creditx-worker.out.log", "Queue processing"],
            ["Queue errors", "/var/log/creditx-worker.err.log", "Queue failures"],
          ]
        ),
        heading("12.3 Key Metrics to Monitor", HeadingLevel.HEADING_2),
        bulletItem("API response times (p95 < 500ms)"),
        bulletItem("Queue depth (pending messages < 100)"),
        bulletItem("Database connections (< 80% of max_connections)"),
        bulletItem("Redis memory usage (< 80% of maxmemory)"),
        bulletItem("Disk usage (alert at 80%)"),
        sectionBreak(),

        // ─── 13. BACKUP ───
        heading("13. Backup & Disaster Recovery"),
        heading("13.1 Database Backup", HeadingLevel.HEADING_2),
        codePara("# Daily backup cron (3:00 AM)"),
        codePara("0 3 * * * pg_dump -U creditx_user creditx_db | gzip > /backups/creditx_$(date +\\%Y\\%m\\%d).sql.gz"),
        codePara(""),
        codePara("# Retain 30 days of backups"),
        codePara("find /backups -name 'creditx_*.sql.gz' -mtime +30 -delete"),
        heading("13.2 File Storage Backup", HeadingLevel.HEADING_2),
        codePara("rsync -avz /www/wwwroot/creditx/backend/storage/ /backups/storage/"),
        heading("13.3 Restore Procedure", HeadingLevel.HEADING_2),
        codePara("gunzip -c /backups/creditx_20260411.sql.gz | psql -U creditx_user creditx_db"),
        sectionBreak(),

        // ─── 14. ROLLBACK ───
        heading("14. Rollback Procedures"),
        para("If a deployment fails, follow these steps:"),
        bulletItem("Git revert: git checkout <previous_commit_hash>"),
        bulletItem("Reinstall dependencies: composer install --no-dev --optimize-autoloader"),
        bulletItem("Run schema update if entity changes were reverted: php bin/doctrine orm:schema-tool:update --force"),
        bulletItem("Restart PHP-FPM: systemctl restart php8.3-fpm"),
        bulletItem("Restart queue workers: supervisorctl restart creditx-worker:*"),
        bulletItem("Verify health: curl https://api.creditx.com/api/health"),
        bulletItem("For database rollback: restore from latest backup (see section 13)"),
        sectionBreak(),

        // ─── 15. APPENDIX ───
        heading("15. Appendix: Environment Variables"),
        makeTable(
          ["Variable", "Example", "Required", "Description"],
          [
            ["APP_ENV", "production", "Yes", "Application environment"],
            ["APP_TIMEZONE", "Africa/Lagos", "Yes", "Default timezone"],
            ["DB_HOST", "127.0.0.1", "Yes", "PostgreSQL host"],
            ["DB_PORT", "5432", "Yes", "PostgreSQL port"],
            ["DB_NAME", "creditx_db", "Yes", "Database name"],
            ["DB_USER", "creditx_user", "Yes", "Database user"],
            ["DB_PASSWORD", "***", "Yes", "Database password"],
            ["JWT_SECRET", "random_64_char_string", "Yes", "JWT signing secret"],
            ["JWT_ACCESS_TTL", "900", "Yes", "Access token TTL (seconds)"],
            ["JWT_REFRESH_TTL", "604800", "Yes", "Refresh token TTL (seconds)"],
            ["REDIS_HOST", "127.0.0.1", "Yes", "Redis host"],
            ["REDIS_PORT", "6379", "Yes", "Redis port"],
            ["REDIS_PASSWORD", "***", "No", "Redis password"],
            ["CORS_ORIGIN", "https://admin.creditx.com", "Yes", "Allowed CORS origin"],
            ["STORAGE_PATH", "storage/uploads", "Yes", "File storage path"],
            ["ZEPTOMAIL_API_KEY", "***", "No", "ZeptoMail API key for email"],
            ["ZEPTOMAIL_FROM_EMAIL", "noreply@creditx.com", "No", "From email address"],
            ["ZEPTOMAIL_FROM_NAME", "CreditX", "No", "From display name"],
            ["TERMII_API_KEY", "***", "No", "Termii API key for SMS"],
            ["TERMII_SENDER_ID", "CreditX", "No", "SMS sender ID"],
            ["PAYSTACK_SECRET_KEY", "***", "No", "Paystack secret key"],
            ["PAYSTACK_WEBHOOK_SECRET", "***", "No", "Paystack webhook signature"],
            ["FRONTEND_URL", "https://admin.creditx.com", "Yes", "Admin frontend URL"],
          ]
        ),
        para(""),
        para("— End of Runbook —", { color: "64748B", italics: true }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/claude/creditx/docs/CreditX_v2.0_Deployment_Runbook.docx", buffer);
  console.log("Runbook created successfully");
});
