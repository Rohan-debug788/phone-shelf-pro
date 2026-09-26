# Stock Keeper

Project Scope: Phone Shop Inventory & Stock Management System

1. Overview

A single-shop, web-based inventory and stock management system for a phone retail business. Built as a website with PWA support. There is no payment processing — the system tracks physical stock custody and sales as inventory events, not financial transactions.

Two roles: Admin (shop owner/manager) and Agent (sales staff). No public signup — all accounts are provisioned by Admin.

2. Tech Stack

Framework: Next.js (React + TypeScript) — single codebase for frontend and backend (API routes / server actions)

Database: PostgreSQL, hosted on Neon (free tier to start)

ORM: Prisma

Auth: Custom session-based auth (e.g., Lucia or hand-rolled), not a third-party auth provider — requirements are simple (email + password, admin-provisioned, no OAuth)

Hosting: Vercel (Next.js) + Neon (Postgres)

PWA: Installable, app-like experience for shop-floor use. No offline-first sync required — standard wifi connectivity assumed.

3. User Roles & Permissions

Action Admin Agent View dashboard ✅ ✅ (own activity/holdings only) View full inventory ✅ ✅ (read-only) Add new stock ✅ ❌ Transfer stock (assign/reclaim custody) ✅ ❌ Record a sale ❌ ✅ (only units currently assigned to them) View Sales Registered (all) ✅ ✅ (own sales only) Manage users (add/deactivate agents) ✅ ❌ Edit company details ✅ ❌ View reports (daily/weekly, downloadable) ✅ ❌ View own sales history ✅ ✅ (own sales only, not downloadable) Change own password ✅ ✅

All permission checks must be enforced server-side (API routes / server actions), never only in UI rendering logic. Hiding a button is not a security control.

4. Core Data Model

users

id (PK)

email (unique)

name

employee_id (optional, unique — e.g. AG-001)

password_hash

role (admin | agent)

must_change_password (boolean, default true on creation)

email_verified (boolean, default false)

is_active (boolean, default true — soft-delete flag, never hard-delete users)

created_at

stock_units

Each row = one physical phone (unit-level tracking via IMEI, not aggregate quantity).

id (PK)

imei (unique, required)

model

variant (storage/color, optional)

status (in_store | with_agent | sold)

current_holder_id (FK → users, nullable — set when status = with_agent)

date_added

date_sold (nullable)

sold_by_id (FK → users, nullable)

supplier (optional, free text)

stock_transfers

Log of every custody change (audit trail).

id (PK)

stock_unit_id (FK)

from_status

to_status

from_holder_id (FK → users, nullable)

to_holder_id (FK → users, nullable)

performed_by_id (FK → users — always Admin)

timestamp

sales

id (PK)

stock_unit_id (FK, unique — one sale per unit)

sold_by_id (FK → users)

timestamp

buyer_name (optional)

buyer_phone (optional)

auth_tokens

Used for both password reset and email verification (distinguished by purpose).

id (PK)

user_id (FK)

token (random, 32+ bytes, hashed at rest — do not store raw token)

purpose (password_reset | email_verification)

expires_at

used_at (nullable — null means unused)

created_at

company_settings

Single-row config table.

shop_name

address

contact_info

(extend as needed for receipt/report branding)

5. Feature Modules

5.1 Dashboard

Today's sales count

Current stock summary (in store / with agents / sold)

Aged stock alert widget (e.g., "N units over 60 days")

Pending items needing attention (nothing sold in X days, etc. — optional v2)

5.2 Inventory

Full list of stock units, filterable by status, model, holder

Per-unit view shows: IMEI, model, variant, status, current holder, date_added, days in stock

Aged stock visually flagged (e.g., >30 days yellow, >60 days red — thresholds configurable later, hardcoded initially)

5.3 Add Stock (Admin only)

Form to register new stock intake: supplier (optional), date received, and one or more units

Batch entry for same model/variant, but each unit requires its own unique IMEI

Enforce IMEI uniqueness at the database level (unique constraint) and surface a clear error on duplicate entry

New units default to status = in_store

5.4 Stock Transfer (Admin only)

Admin selects one or more in_store units and assigns to a chosen Agent → status = with_agent, current_holder_id set

Reverse transfer: Admin selects unit(s) currently with_agent and returns to in_store → current_holder_id cleared

No agent-to-agent transfer — a unit must always pass back through in_store before reassignment

Every transfer (forward or reverse) creates a stock_transfers log entry

View: "who currently holds what" — grouped by agent, for reconciliation

5.5 Sales

Agent-facing screen showing only units where status = with_agent AND current_holder_id = current_user

Agent marks a unit as sold → status = sold, date_sold set, sold_by_id set, creates a sales record

Optional buyer name/phone capture at point of sale

5.6 Sales Registered

Read-only historical log of all sales

Admin view: all sales, filterable by agent, date range, model

Agent view: own sales only

Agent name display must reflect inactive flag if the agent has since been deactivated (e.g., "Sold by: Jane (inactive)") — computed at render time from current is_active status, not stored on the sale record

5.7 Users (Admin only)

List all agents with status (active/inactive) and email verification badge

Add agent: name, email, employee_id (optional) → system generates random temp password, sets must_change_password = true, email_verified = false, triggers verification email

Deactivate agent (soft delete — sets is_active = false, does not delete the row or any historical records)

Reactivate agent if needed

Admin-triggered password reset (generates new temp password, same forced-change flow) — fallback path if self-recovery fails (e.g., wrong email on file)

5.8 Admin — Company Details

Edit shop name, address, contact info (maps to company_settings)

5.9 Reports (Admin only)

Daily and weekly sales/stock reports

Aged stock report (units sorted by longest time in in_store or overall, per business definition confirmed: from original date_added, unaffected by transfers)

Sales by period (day/week/month)

Sales by agent

Current holdings by agent (reconciliation report: what an agent has vs. has sold)

Stock on hand vs. sold summary

Downloadable/exportable file (e.g., CSV or PDF) for daily/weekly reports — Admin-only capability, not available to Agents

Agents do not access this Reports module. Their own sales history is a separate, simpler view under Sales Registered (Section 5.6) — visible in-app only, no download/export option.

6. Authentication & Security Requirements

6.1 Password handling

Hash all passwords with bcrypt or argon2 — never plaintext, never fast hashes (MD5/SHA1/SHA256 alone)

Temp passwords (on account creation and admin-triggered reset) must be randomly generated, not predictable

must_change_password flag forces a password-change screen immediately after first successful login, before any other part of the app is accessible

6.2 Session management

Use httpOnly, secure, sameSite cookies for sessions — never store session tokens in localStorage

Session tokens must be cryptographically random

Reasonable session expiry (balance shop-floor convenience vs. security — e.g., re-auth after some hours/days of inactivity)

Invalidate all existing sessions for a user immediately after any password change or reset

6.3 Brute-force protection

Rate-limit login attempts (per IP and/or per account)

Apply a short lockout or increasing delay after repeated failed attempts — avoid indefinite lockout to prevent denial-of-service against a legitimate user

6.4 Account enumeration prevention

Login errors: generic "Invalid email or password" — never reveal whether the email exists

Password reset requests: always respond with the same generic message ("If that email is registered, a reset link has been sent") regardless of whether the account exists

6.5 Password reset (self-service)

Random, single-use, time-limited (15–30 min) tokens — store hashed, never raw, in auth_tokens

Token must be scoped to one specific user_id, verified on both validity and match at reset time

Rate-limit reset requests per email/IP

On successful reset: invalidate all existing sessions for that user

Only proceed with reset flow if email_verified = true for that account; if unverified, direct the agent to contact Admin for a manual reset instead

6.6 Email verification

Triggered automatically on account creation (not blocking login — Admin's in-person temp password handoff already establishes identity for first login)

Same token infrastructure as password reset, distinguished by purpose = email_verification

Re-trigger verification (reset email_verified = false) any time an account's email is changed

Admin's Users list surfaces verification status so a bad email address can be caught and corrected early

6.7 Authorization (server-side enforcement)

Every API route / server action must independently verify the requesting user's role and ownership (e.g., an Agent can only mark their own held units as sold) — never rely solely on UI hiding controls

Explicit checks required for: stock transfer (admin only), add stock (admin only), user management (admin only), sales (agent, own units only)

6.8 Injection & input handling

Use Prisma's parameterized queries by default; avoid raw SQL string concatenation with user input

Validate and sanitize all form inputs server-side (not just client-side validation)

6.9 Transport & secrets

HTTPS enforced everywhere (default on Vercel)

All secrets (database URL, session signing keys, etc.) stored as environment variables — never committed to the repository

6.10 Audit trail

Log failed login attempts (who/when) and password changes for later review

Every stock transfer and sale is already logged with actor, timestamp, and before/after state by design (see data model)

7. Build Phases (Suggested Order)

Foundation: Next.js + TypeScript + Prisma + Neon setup, deploy pipeline to Vercel

Auth core: user model, password hashing, session management, login/logout

Admin: user management: add/deactivate agents, temp password + forced change flow, email verification

Password recovery: self-service reset + admin-triggered reset fallback

Inventory core: stock_units model, Add Stock (admin), Inventory list view

Stock Transfer: assign/reclaim custody, transfer log, "who holds what" view

Sales: agent sales screen (own units only), Sales Registered log (admin: all, agent: own)

Reports: aged stock, sales by period/agent, current holdings reconciliation

Dashboard: summary widgets pulling from the above

Admin settings: company details

PWA setup: manifest, service worker, installability

Security hardening pass: rate limiting, audit logging, review of all server-side authorization checks before go-live

8. Explicit Non-Goals (v1)

No payment processing or financing/installment tracking

No agent-to-agent direct stock transfer

No offline-first data sync (PWA is for installability/UX, not offline operation)

No public signup

No multi-branch support (single shop only)

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://phone-shelf-pro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/494fca48-fd4e-4979-980b-bb079d27c0af).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
