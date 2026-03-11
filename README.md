# Codex Client Portal

Client portal for **BTC Treasury Codex** (codexyield.com) — a Bitcoin treasury management service.

Live at: **https://client.codexyield.com**

---

## What This Is

A private portal where clients log in to see their **BTC Alpha** — how much more Bitcoin they've accumulated compared to a simple buy-and-hold (DCA) strategy. This metric is the core value proposition and drives client referrals.

---

## Architecture

```
Hostinger VPS (187.124.149.19)
├── Node.js/Express server (PM2: codex-portal)
├── MySQL database (codex_portal)
├── Background sync job (runs every 5 minutes)
└── Static frontend (React/Vite, served from dist/public)
```

**Stack:** Node.js + Express + tRPC + React + Vite + Drizzle ORM + MySQL

**Data source:** sFOX API exclusively (balances, transactions, prices)

---

## Key Files

| File | Purpose |
|---|---|
| `server/btcAlpha.ts` | BTC alpha calculation engine — the core business logic |
| `server/syncJob.ts` | Background sync: fetches sFOX data every 5 min, writes to DB |
| `server/sfox.ts` | sFOX API client (balances, transactions, prices) |
| `server/routers.ts` | tRPC API endpoints (reads from DB, never calls sFOX directly) |
| `server/db.ts` | MySQL connection and query helpers |
| `server/_core/magicLink.ts` | Magic link email authentication |
| `drizzle/schema.ts` | Database schema |
| `client/src/pages/Dashboard.tsx` | Client dashboard (logged-in client's own view) |
| `client/src/pages/Admin.tsx` | Admin panel (add clients, view all alpha metrics) |
| `client/src/pages/ClientView.tsx` | Admin view of a specific client's dashboard |

---

## BTC Alpha Calculation

The benchmark answers: *"If this client had just bought and held BTC every time we bought BTC for them, how much would they have?"*

**Rules:**
- **USD→BTC purchases:** Add to both actual and benchmark
- **BTC deposits:** Add to both actual and benchmark
- **BTC→altcoin rotations (sell, price ≤ $1000):** Reduce actual only — benchmark holds BTC. Alpha is generated when the altcoin is sold back for MORE BTC.
- **BTC→USD exits (sell, price > $1000):** Reduce both — neutral event
- **BTC withdrawals (action = "Withdraw"):** Reduce both — neutral event (client's money leaving the program)

See `server/btcAlpha.ts` for full implementation with comments.

---

## Authentication

Magic link email auth. No passwords. Flow:
1. Client enters email on login page
2. Server sends a one-time link via Hostinger SMTP (matt@codexyield.com)
3. Client clicks link → verified → JWT session cookie set
4. Admin users: matt@codexyield.com, chrisie@codexyield.com

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | All users (clients + admins) |
| `client_credentials` | sFOX API keys per client (encrypted) |
| `portfolio_snapshots` | Pre-computed portfolio data, one row per client |
| `sync_log` | Record of each sync attempt |
| `magic_link_tokens` | One-time login tokens |
| `support_requests` | "Request a call" submissions |
| `reports` | Intelligence reports (future use) |
| `admin_messages` | Admin-to-client messages (future use) |

---

## Deployment

```bash
# Build
pnpm build

# Deploy to VPS
rsync -avz --delete dist/ root@187.124.149.19:/var/www/codex-portal/dist/

# Restart
ssh root@187.124.149.19 "pm2 restart codex-portal"
```

Environment variables are in `/var/www/codex-portal/.env` on the VPS.

---

## Development

```bash
pnpm install
pnpm dev
```

Requires a `.env` file with `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, and SMTP credentials.
