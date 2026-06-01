import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let app: Awaited<ReturnType<typeof import("../app.js").buildApp>>;
let sqlite: typeof import("../db/client.js").sqlite;
let cookie = "";
let tmpDir = "";

async function authenticate() {
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "admin",
      password: "change-me-on-first-login"
    }
  });
  expect(login.statusCode).toBe(200);
  cookie = login.headers["set-cookie"] as string;

  const change = await app.inject({
    method: "POST",
    url: "/api/auth/change-password",
    headers: { cookie },
    payload: {
      currentPassword: "change-me-on-first-login",
      newPassword: "asset-safety-password"
    }
  });
  expect(change.statusCode).toBe(200);
  cookie = change.headers["set-cookie"] as string;
}

beforeEach(async () => {
  vi.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pocket-ledger-asset-safety-"));
  process.env.APP_ENV = "test";
  process.env.DATABASE_URL = `file:${path.join(tmpDir, "asset-safety.db")}`;
  process.env.BACKUP_DIR = path.join(tmpDir, "backups");
  process.env.SESSION_SECRET = "asset-safety-session-secret-0001";

  const appModule = await import("../app.js");
  const dbModule = await import("../db/client.js");
  app = await appModule.buildApp();
  sqlite = dbModule.sqlite;
  await authenticate();
});

afterEach(async () => {
  await app?.close();
  sqlite?.close();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("asset preferences and data safety", () => {
  test("accounts can be reordered and duplicate names can be audited", async () => {
    const created = [];
    for (const name of ["Sort A", "Sort B", "Sort C"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/accounts",
        headers: { cookie },
        payload: { name, type: "cash", kind: "asset", initialBalance: 0 }
      });
      expect(response.statusCode).toBe(200);
      created.push(response.json().data.id as string);
    }

    const reorder = await app.inject({
      method: "PUT",
      url: "/api/accounts/reorder",
      headers: { cookie },
      payload: { accountIds: [created[2], created[0], created[1]] }
    });
    expect(reorder.statusCode).toBe(200);

    const accounts = await app.inject({
      method: "GET",
      url: "/api/accounts",
      headers: { cookie }
    });
    expect(accounts.statusCode).toBe(200);
    const orderedIds = (accounts.json().data as Array<{ id: string }>).map((account) => account.id);
    const [sortA, sortB, sortC] = created as [string, string, string];
    expect(orderedIds.indexOf(sortC)).toBeLessThan(orderedIds.indexOf(sortA));
    expect(orderedIds.indexOf(sortA)).toBeLessThan(orderedIds.indexOf(sortB));

    sqlite
      .prepare(
        "INSERT INTO accounts (id, name, type, kind, initial_balance, current_balance_cache, created_at, updated_at) VALUES ('dup_one', 'Duplicate Name', 'cash', 'asset', '0.00', '0.00', ?, ?)"
      )
      .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        "INSERT INTO accounts (id, name, type, kind, initial_balance, current_balance_cache, created_at, updated_at) VALUES ('dup_two', 'Duplicate Name', 'cash', 'asset', '0.00', '0.00', ?, ?)"
      )
      .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const audit = await app.inject({
      method: "GET",
      url: "/api/accounts/audit/duplicates",
      headers: { cookie }
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().data).toContainEqual(
      expect.objectContaining({
        name: "Duplicate Name",
        count: 2
      })
    );
  });

  test("receivable summary asset follows include-in-assets preference", async () => {
    sqlite
      .prepare(
        `INSERT INTO loans
          (id, direction, counterparty, principal_amount, remaining_amount_cache, interest_amount_cache, account_id,
           happened_on, status, created_at, updated_at)
         VALUES
          ('loan_receivable_asset', 'receivable', 'Receivable User', '120.00', '120.00', '0.00', 'cash',
           '2026-01-01', 'open', ?, ?)`
      )
      .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    const initial = await app.inject({
      method: "GET",
      url: "/api/accounts?includeVirtual=true",
      headers: { cookie }
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().data).toContainEqual(
      expect.objectContaining({
        id: "virtual_receivable:loan_group_receivable_default",
        loanGroupId: "loan_group_receivable_default",
        name: "\u5e94\u6536\u8d26",
        balance: "120.00",
        includeInAssets: true,
        virtual: true
      })
    );

    const accountIds = (initial.json().data as Array<{ id: string; virtual?: boolean }>)
      .filter((account) => !account.virtual)
      .map((account) => account.id);
    const hide = await app.inject({
      method: "PUT",
      url: "/api/accounts/include-in-assets",
      headers: { cookie },
      payload: { accountIds }
    });
    expect(hide.statusCode).toBe(200);

    const hidden = await app.inject({
      method: "GET",
      url: "/api/accounts?includeVirtual=true",
      headers: { cookie }
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().data).toContainEqual(
      expect.objectContaining({
        id: "virtual_receivable:loan_group_receivable_default",
        loanGroupId: "loan_group_receivable_default",
        includeInAssets: false,
        virtual: true
      })
    );
  });

  test("multiple receivable groups produce separate virtual assets and filter hidden loan details", async () => {
    const createdAt = "2026-01-01T00:00:00.000Z";
    const groupResponse = await app.inject({
      method: "POST",
      url: "/api/loans/groups",
      headers: { cookie },
      payload: { name: "Project Receivable", direction: "receivable", color: "#533AFD", includeInAssets: true }
    });
    expect(groupResponse.statusCode).toBe(200);
    const groupId = groupResponse.json().data.id as string;

    sqlite
      .prepare(
        `INSERT INTO loans
          (id, direction, loan_group_id, counterparty, principal_amount, remaining_amount_cache, interest_amount_cache, account_id,
           happened_on, status, created_at, updated_at)
         VALUES
          ('loan_default_group', 'receivable', 'loan_group_receivable_default', 'Default User', '80.00', '80.00', '0.00', 'cash',
           '2026-01-01', 'open', ?, ?),
          ('loan_project_group', 'receivable', ?, 'Project User', '220.00', '220.00', '0.00', 'cash',
           '2026-01-02', 'open', ?, ?)`
      )
      .run(createdAt, createdAt, groupId, createdAt, createdAt);

    const accounts = await app.inject({
      method: "GET",
      url: "/api/accounts?includeVirtual=true",
      headers: { cookie }
    });
    expect(accounts.statusCode).toBe(200);
    expect(accounts.json().data).toContainEqual(
      expect.objectContaining({
        id: "virtual_receivable:loan_group_receivable_default",
        balance: "80.00",
        loanGroupId: "loan_group_receivable_default"
      })
    );
    expect(accounts.json().data).toContainEqual(
      expect.objectContaining({
        id: `virtual_receivable:${groupId}`,
        balance: "220.00",
        loanGroupId: groupId
      })
    );

    const hideGroup = await app.inject({
      method: "PUT",
      url: "/api/accounts/include-in-assets",
      headers: { cookie },
      payload: { accountIds: [`virtual_receivable:${groupId}`] }
    });
    expect(hideGroup.statusCode).toBe(200);

    const loans = await app.inject({
      method: "GET",
      url: "/api/loans?status=open&direction=receivable",
      headers: { cookie }
    });
    expect(loans.statusCode).toBe(200);
    expect((loans.json().data as Array<{ id: string }>).map((loan) => loan.id)).toEqual(["loan_project_group"]);
  });

  test("backup schedule can be saved and clear-all requires multiple confirmations with safety backup", async () => {
    const schedule = await app.inject({
      method: "PUT",
      url: "/api/backups/schedule",
      headers: { cookie },
      payload: { enabled: true, frequency: "weekly" }
    });
    expect(schedule.statusCode).toBe(200);
    expect(schedule.json().data).toMatchObject({ enabled: true, frequency: "weekly" });

    const readSchedule = await app.inject({
      method: "GET",
      url: "/api/backups/schedule",
      headers: { cookie }
    });
    expect(readSchedule.statusCode).toBe(200);
    expect(readSchedule.json().data).toMatchObject({ enabled: true, frequency: "weekly" });

    const rejected = await app.inject({
      method: "POST",
      url: "/api/backups/clear-all",
      headers: { cookie },
      payload: { confirmation: "wrong", secondConfirmation: true }
    });
    expect(rejected.statusCode).toBe(400);

    const cleared = await app.inject({
      method: "POST",
      url: "/api/backups/clear-all",
      headers: { cookie },
      payload: { confirmation: "\u6e05\u7a7a\u6240\u6709\u6570\u636e", secondConfirmation: true }
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().data.safetyBackup).toMatch(/pre-clear.*\.db$/);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM transactions").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM clear_logs").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get()).toEqual({ count: 1 });

    const groupAfterClear = await app.inject({
      method: "POST",
      url: "/api/loans/groups",
      headers: { cookie },
      payload: { name: "Post Clear Receivable", direction: "receivable", color: "#533AFD", includeInAssets: true }
    });
    expect(groupAfterClear.statusCode).toBe(200);

    const groups = await app.inject({
      method: "GET",
      url: "/api/loans/groups?direction=receivable",
      headers: { cookie }
    });
    expect(groups.statusCode).toBe(200);
    expect((groups.json().data as Array<{ name: string }>).map((group) => group.name)).toEqual(["\u5e94\u6536\u8d26", "Post Clear Receivable"]);
  });
});
