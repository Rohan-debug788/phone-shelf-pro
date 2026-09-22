# Phone Shop Inventory & Stock Management

A single-shop system for tracking phones by IMEI, who holds them, and what gets sold. Two roles: Admin (owner/manager) and Agent (sales staff). No public signup — Admin creates every account.

## One change to your spec

You asked for Next.js + Prisma + Neon + hand-rolled sessions on Vercel. This platform builds on its own stack (React + TanStack Start) with built-in Lovable Cloud for the database, accounts, and server code. Everything in your scope is achievable, with two practical differences:

- Accounts and sessions use the built-in secure login system (HTTP-only cookies, hashed passwords, leaked-password checks, email verification, password reset) instead of hand-rolled sessions. This covers section 6 without custom token tables.
- Roles live in a dedicated roles table, checked on the server for every action, never trusted from the browser.

If you must stay on Next.js/Prisma/Neon, this is not the right platform — tell me and we stop here.

## What gets built

**Data**
- users profile (name, employee ID, active flag, must-change-password)
- user roles (admin / agent), separate table
- stock units (IMEI unique, model, variant, status, current holder, dates, supplier)
- stock transfers (full custody audit trail)
- sales (one per unit, buyer name/phone optional)
- company settings (single row)
- audit log for logins and password changes

Every table has server-enforced access rules: agents read inventory, can only sell units currently in their own hands; only admins add stock, move stock, manage users, and open reports.

**Screens**
- Login, forced password change on first login, forgot/reset password
- Dashboard: today's sales, stock split (in store / with agents / sold), aged-stock alert
- Inventory: filter by status, model, holder; aged units flagged yellow after 30 days, red after 60
- Add Stock (admin): supplier, date received, batch entry of one model with individual IMEIs, duplicate IMEI rejected with a clear message
- Stock Transfer (admin): assign in-store units to an agent, reclaim back to store, plus a "who holds what" view grouped by agent
- Sales (agent): only their own held units, mark sold with optional buyer details
- Sales Registered: admin sees all with filters; agent sees own only; deactivated sellers shown as "Jane (inactive)"
- Users (admin): add agent with temp password, verification badge, deactivate/reactivate, admin-triggered reset
- Company details (admin)
- Reports (admin only): daily/weekly sales, sales by period and agent, aged stock, holdings reconciliation, stock on hand vs sold, CSV download
- Installable app (manifest + icons), online-only

## Build order

1. Cloud setup, database tables, access rules, roles
2. Login, forced password change, password reset, first admin account
3. Users management (admin)
4. Add Stock + Inventory list
5. Stock Transfer + holdings view
6. Sales + Sales Registered
7. Reports with CSV export
8. Dashboard
9. Company details
10. Installable app setup, then a security review pass

## Look and feel

Clean, high-contrast shop-floor interface: large tap targets, dense data tables on desktop, card lists on phones. Deep slate and amber accent palette, no purple. Status colours carry meaning (in store / with agent / sold, and stock-age warnings).

## First account

I will create one admin account for you and give you its email and temporary password so you can log in and add your agents.
