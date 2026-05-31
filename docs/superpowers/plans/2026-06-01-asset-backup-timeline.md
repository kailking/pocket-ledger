# Asset Backup Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safer asset visibility, account ordering, scheduled backups, multi-confirm data clearing, receivable asset summary, less prominent payables, and a grouped home timeline.

**Architecture:** Backend owns durable preferences and data safety operations. Frontend renders those preferences without deleting historical data. The home timeline stays paginated but groups loaded transactions by month and natural day.

**Tech Stack:** Fastify, SQLite/better-sqlite3, React, TanStack Query, Vite, Vitest, Docker Compose.

---

## File Structure

- Modify `apps/api/src/db/bootstrap.ts`: add `accounts.sort_order`, `settings`, and `clear_logs` tables.
- Modify `apps/api/src/db/schema.ts`: mirror new schema fields.
- Modify `apps/api/src/modules/accounts/routes.ts`: expose ordered accounts, account reorder endpoint, receivable virtual asset, and duplicate-name audit.
- Modify `apps/api/src/modules/backups/routes.ts`: scheduled backup settings, due-run helper, and clear-all endpoint with forced backup.
- Modify `apps/api/src/modules/settings/routes.ts`: app settings read/write helpers if needed.
- Modify `apps/api/src/app.ts`: run scheduled backup check at startup.
- Add/modify API tests in `apps/api/src/__tests__`.
- Modify `apps/web/src/lib/ledgerStore.ts`: add account metadata fields.
- Modify `apps/web/src/pages/AssetsPage.tsx`: hide non-included accounts, order accounts, configure receivable summary.
- Modify `apps/web/src/pages/MorePage.tsx`: scheduled backup and data clear UI.
- Modify `apps/web/src/pages/LoansPage.tsx`: weaken payable display and respect receivable visibility in summary/detail list.
- Modify `apps/web/src/pages/LedgerHome.tsx`: grouped natural-day timeline with month/day summary nodes.
- Modify `apps/web/src/styles/base.css`: styles for sortable rows, grouped timeline, warning flows.

## Task 1: Backend Safety And Preferences

**Files:**
- Modify: `apps/api/src/db/bootstrap.ts`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/modules/accounts/routes.ts`
- Modify: `apps/api/src/modules/backups/routes.ts`
- Test: `apps/api/src/__tests__/asset-preferences.test.ts`
- Test: `apps/api/src/__tests__/data-safety.test.ts`

- [ ] **Step 1: Write failing backend tests**

Create tests that prove:
- `GET /api/accounts` returns active accounts ordered by `sortOrder`.
- `PUT /api/accounts/reorder` persists order.
- `GET /api/accounts` includes a virtual `receivable_summary` account only when setting `assets.receivable.visible=true`.
- `PUT /api/accounts/include-in-assets` can persist the virtual receivable visibility setting.
- `GET /api/accounts/audit/duplicates` reports duplicate active account names.
- `GET /api/backups/schedule` and `PUT /api/backups/schedule` round-trip settings.
- `POST /api/backups/clear-all` rejects missing phrase and creates a safety backup before clearing finance tables.

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run test -w @pocket-ledger/api -- src/__tests__/asset-preferences.test.ts src/__tests__/data-safety.test.ts
```

Expected: FAIL because endpoints/columns do not exist.

- [ ] **Step 2: Implement schema migrations**

Add idempotent migrations in `ensureDatabase()`:
- `accounts.sort_order INTEGER NOT NULL DEFAULT 0`.
- `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`.
- `clear_logs(id TEXT PRIMARY KEY, safety_backup TEXT NOT NULL, cleared_at TEXT NOT NULL, confirmation TEXT NOT NULL)`.

Backfill `accounts.sort_order` from current active account order where zero.

- [ ] **Step 3: Implement account preferences**

Add:
- `GET /api/accounts/audit/duplicates`.
- `PUT /api/accounts/reorder` body `{ accountIds: string[] }`.
- Settings helpers for `assets.receivable.visible`.
- `GET /api/accounts` appends a virtual account:

```ts
{
  id: "virtual_receivable",
  name: "应收账",
  type: "receivable_summary",
  kind: "asset",
  balance: open receivable remaining total,
  includeInAssets: true,
  virtual: true
}
```

When receivable visibility is off, do not append it and do not include it in asset total.

- [ ] **Step 4: Implement backup settings and clear-all**

Add:
- `GET /api/backups/schedule`
- `PUT /api/backups/schedule`
- `POST /api/backups/run-scheduled`
- `POST /api/backups/clear-all`

Clear-all requires body `{ confirmation: "清空所有数据", secondConfirmation: true }`, creates a backup named `pre-clear`, clears finance tables but keeps users/session ability, then inserts a clear log.

- [ ] **Step 5: Run backend tests**

Run the failing command again. Expected: PASS.

## Task 2: Asset And More Frontend

**Files:**
- Modify: `apps/web/src/lib/ledgerStore.ts`
- Modify: `apps/web/src/pages/AssetsPage.tsx`
- Modify: `apps/web/src/pages/MorePage.tsx`
- Modify: `apps/web/src/styles/base.css`

- [ ] **Step 1: Implement asset visibility**

Filter asset list to `account.kind === assetMode && account.includeInAssets`. Keep the include settings sheet able to show hidden/unincluded real accounts.

- [ ] **Step 2: Implement account ordering**

Add a sorting sheet from the asset header. Use up/down buttons for reliability on mobile. Submit ordered real account ids to `/api/accounts/reorder`.

- [ ] **Step 3: Implement receivable virtual account controls**

Show virtual `应收账` in the asset list when backend returns it. In include settings, allow toggling the virtual id and submit it through `/api/accounts/include-in-assets`.

- [ ] **Step 4: Implement backup and clear UI**

In More page:
- Show scheduled backup switch and frequency (`daily`, `weekly`, `monthly`).
- Add a danger section for clear data.
- Require first checkbox, exact text `清空所有数据`, and final confirm dialog before calling `/api/backups/clear-all`.

## Task 3: Loans UX

**Files:**
- Modify: `apps/web/src/pages/LoansPage.tsx`
- Modify: `apps/web/src/styles/base.css`

- [ ] **Step 1: Weaken payable entry**

Default remains receivable. Keep payable accessible but visually quieter; use a secondary text button or compact switch.

- [ ] **Step 2: Respect receivable visibility**

Read `/api/accounts` and detect `virtual_receivable`. If hidden, suppress receivable total in the hero and show a short muted hint. Do not delete or hide underlying loan records from API.

## Task 4: Grouped Home Timeline

**Files:**
- Modify: `apps/web/src/pages/LedgerHome.tsx`
- Modify: `apps/web/src/styles/base.css`

- [ ] **Step 1: Add grouping helpers**

Group loaded transactions in descending order by month and date. For each date compute income sum and expense sum. Month marker appears when month changes.

- [ ] **Step 2: Render screenshot-like timeline**

Render:
- one central month node when month changes;
- one central day node per natural day;
- day income summary on the left and expense summary on the right;
- transaction rows without repeated dates.

- [ ] **Step 3: Preserve infinite loading and refresh**

Keep existing sentinel and pull-to-refresh. Verify scrolling loads the next page.

## Task 5: Verification

**Files:**
- No code-only files; run commands and browser checks.

- [ ] **Step 1: Run tests**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run test -w @pocket-ledger/api
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

- [ ] **Step 2: Rebuild Docker**

```powershell
docker compose -p pocket-ledger-local up -d --build
docker compose -p pocket-ledger-local ps
Invoke-RestMethod -Uri 'http://localhost:3000/health'
```

- [ ] **Step 3: Browser mobile QA**

Use the in-app browser at 430x932 to verify:
- asset hidden accounts disappear;
- account reorder sheet persists;
- More scheduled backup and clear UI render;
- loan payable is less prominent;
- home timeline day/month grouping and infinite loading work;
- no horizontal overflow and no console errors.

