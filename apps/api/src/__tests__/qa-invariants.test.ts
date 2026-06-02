import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

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
      newPassword: "qa-worker-password"
    }
  });
  expect(change.statusCode).toBe(200);
  cookie = change.headers["set-cookie"] as string;
}

function insertTransaction(id: string, createdAt: string) {
  sqlite
    .prepare(
      `
      INSERT INTO transactions
        (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, created_at, updated_at)
      VALUES
        (?, 'expense', '2026-05-31', '-1.00', '1.00', 'cash', 'general', 'default', NULL, 'qa pagination', ?, ?)
    `
    )
    .run(id, createdAt, createdAt);
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pocket-ledger-qa-"));
  process.env.APP_ENV = "test";
  process.env.DATABASE_URL = `file:${path.join(tmpDir, "qa.db")}`;
  process.env.SESSION_SECRET = "qa-worker-session-secret-0001";

  const appModule = await import("../app.js");
  const dbModule = await import("../db/client.js");
  app = await appModule.buildApp();
  sqlite = dbModule.sqlite;
  await authenticate();
});

afterAll(async () => {
  await app?.close();
  sqlite?.close();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("QA invariants", () => {
  test("archived accounts remain readable through statement API", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie },
      payload: {
        name: "QA archived statement",
        type: "cash",
        kind: "asset",
        initialBalance: 10
      }
    });
    expect(create.statusCode).toBe(200);
    const accountId = create.json().data.id as string;

    const adjust = await app.inject({
      method: "POST",
      url: `/api/accounts/${accountId}/adjust-balance`,
      headers: { cookie },
      payload: {
        targetBalance: 15,
        happenedOn: "2026-05-31",
        note: "qa statement row"
      }
    });
    expect(adjust.statusCode).toBe(200);

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/accounts/${accountId}`,
      headers: { cookie }
    });
    expect(archive.statusCode).toBe(200);

    const statement = await app.inject({
      method: "GET",
      url: `/api/accounts/${accountId}/statement?year=2026`,
      headers: { cookie }
    });

    expect(statement.statusCode).toBe(200);
    expect(statement.json().data.account.id).toBe(accountId);
  });

  test("visible account statements include same-name hidden imported history", async () => {
    const now = "2026-06-01T00:00:00.000Z";
    sqlite
      .prepare(
        `
        INSERT INTO accounts
          (id, name, type, kind, initial_balance, current_balance_cache, color, icon, include_in_assets, sort_order, hidden, created_at, updated_at)
        VALUES
          ('qa_visible_history', 'QA merged history', 'investment', 'asset', '120.00', '120.00', '#5B7CFA', 'wallet', 1, 9000, 0, ?, ?),
          ('qa_hidden_history_a', 'QA merged history', 'cash', 'asset', '0.00', '0.00', '#5B7CFA', 'wallet', 0, 0, 1, ?, ?),
          ('qa_hidden_history_b', 'QA merged history', 'custom', 'asset', '0.00', '0.00', '#5B7CFA', 'wallet', 0, 0, 1, ?, ?)
      `
      )
      .run(now, now, now, now, now, now);
    sqlite
      .prepare(
        `
        INSERT INTO transactions
          (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, created_at, updated_at)
        VALUES
          ('qa_hidden_history_income', 'income', '2026-05-02', '50.00', '50.00', 'qa_hidden_history_a', 'salary', 'default', NULL, 'hidden income', ?, ?),
          ('qa_hidden_history_expense', 'expense', '2026-05-03', '-20.00', '20.00', 'qa_hidden_history_b', 'general', 'default', NULL, 'hidden expense', ?, ?)
      `
      )
      .run(now, now, now, now);

    const statement = await app.inject({
      method: "GET",
      url: "/api/accounts/qa_visible_history/statement?year=2026",
      headers: { cookie }
    });

    expect(statement.statusCode).toBe(200);
    const data = statement.json().data as {
      account: { id: string; balance: string };
      totals: { inflow: string; outflow: string; net: string };
      months: Array<{ month: string; count: number; transactions: Array<{ id: string; runningBalance: string }> }>;
    };
    expect(data.account.id).toBe("qa_visible_history");
    expect(data.account.balance).toBe("120.00");
    expect(data.totals).toEqual({ inflow: "50.00", outflow: "20.00", net: "30.00" });
    const may = data.months.find((month) => month.month === "2026-05");
    expect(may?.count).toBe(2);
    expect(may?.transactions.map((item) => item.id).sort()).toEqual([
      "qa_hidden_history_expense",
      "qa_hidden_history_income"
    ]);
    expect(may?.transactions[0]?.runningBalance).toBe("120.00");
  });

  test("transaction list limit and offset can cover all listable rows", async () => {
    const existing = sqlite
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM transactions
        WHERE deleted_at IS NULL
          AND type NOT IN ('transfer_in', 'transfer_out')
      `
      )
      .get() as { count: number };

    const targetCount = 505;
    for (let index = existing.count; index < targetCount; index += 1) {
      insertTransaction(`qa_page_${index}`, `2026-06-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`);
    }

    const total = sqlite
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM transactions
        WHERE deleted_at IS NULL
          AND type NOT IN ('transfer_in', 'transfer_out')
      `
      )
      .get() as { count: number };

    const firstPage = await app.inject({
      method: "GET",
      url: "/api/transactions?limit=500&offset=0",
      headers: { cookie }
    });
    const secondPage = await app.inject({
      method: "GET",
      url: "/api/transactions?limit=500&offset=500",
      headers: { cookie }
    });

    expect(firstPage.statusCode).toBe(200);
    expect(secondPage.statusCode).toBe(200);

    const rows = [...firstPage.json().data, ...secondPage.json().data] as Array<{ id: string }>;
    expect(rows).toHaveLength(total.count);
    expect(new Set(rows.map((row) => row.id)).size).toBe(total.count);
  });
});
