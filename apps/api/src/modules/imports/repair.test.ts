import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("import repair", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APP_ENV = "test";
    process.env.DATABASE_URL = `file:${path.join(os.tmpdir(), `pocket-ledger-repair-${crypto.randomUUID()}.db`)}`;
    process.env.SESSION_SECRET = "test-session-secret-at-least-24";
  });

  it("rebinds mismatched imported categories and links orphan loan transactions", async () => {
    const { sqlite } = await import("../../db/client.js");
    const { ensureDatabase } = await import("../../db/bootstrap.js");
    const { repairImportedData } = await import("./repair.js");
    ensureDatabase();

    const now = "2026-01-01T00:00:00.000Z";
    sqlite.prepare("DELETE FROM transactions").run();
    sqlite.prepare("DELETE FROM categories").run();
    sqlite.prepare("DELETE FROM accounts").run();
    sqlite.prepare("DELETE FROM loans").run();
    sqlite.prepare("DELETE FROM loan_entries").run();
    sqlite
      .prepare(
        "INSERT INTO accounts (id, name, type, kind, initial_balance, current_balance_cache, created_at, updated_at) VALUES ('acct_cash', '现金', 'cash', 'asset', '0.00', '0.00', ?, ?)"
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO categories (id, name, type, icon, color, created_at, updated_at) VALUES ('cat_bonus_expense', '红包', 'expense', 'star', '#fff', ?, ?)"
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO transactions (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, raw_payload, created_at, updated_at) VALUES ('txn_income', 'income', '2026-01-01', '88.00', '88.00', 'acct_cash', 'cat_bonus_expense', 'default', ?, ?, ?)"
      )
      .run(JSON.stringify({ 收支类型: "收入", 账目分类: "红包" }), now, now);
    sqlite
      .prepare(
        "INSERT INTO transactions (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, note, raw_payload, created_at, updated_at) VALUES ('txn_loan', 'loan', '2026-01-02', '-100.00', '100.00', 'acct_cash', NULL, 'default', '张三', ?, ?, ?)"
      )
      .run(JSON.stringify({ 收支类型: "支出", 账目分类: "借出", 成员: "张三" }), now, now);

    const summary = repairImportedData({ now });

    expect(summary.categoriesRebound).toBe(1);
    expect(summary.orphanLoanTransactionsLinked).toBe(1);
    expect(sqlite.prepare("SELECT type FROM categories WHERE id = (SELECT category_id FROM transactions WHERE id = 'txn_income')").get()).toEqual({
      type: "income"
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM transactions WHERE type = 'loan' AND loan_id IS NULL AND deleted_at IS NULL").get()).toEqual({
      count: 0
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM loans").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM loan_entries WHERE transaction_id = 'txn_loan'").get()).toEqual({ count: 1 });
  });

  it("attaches an orphan principal transaction to an existing loan that already has entries", async () => {
    const { sqlite } = await import("../../db/client.js");
    const { ensureDatabase } = await import("../../db/bootstrap.js");
    const { repairImportedData } = await import("./repair.js");
    ensureDatabase();

    const now = "2026-01-01T00:00:00.000Z";
    sqlite.prepare("DELETE FROM transactions").run();
    sqlite.prepare("DELETE FROM accounts").run();
    sqlite.prepare("DELETE FROM loans").run();
    sqlite.prepare("DELETE FROM loan_entries").run();
    sqlite
      .prepare(
        "INSERT INTO accounts (id, name, type, kind, initial_balance, current_balance_cache, created_at, updated_at) VALUES ('acct_wechat', 'WeChat', 'wallet', 'asset', '0.00', '0.00', ?, ?)"
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO loans
          (id, direction, counterparty, principal_amount, remaining_amount_cache, interest_amount_cache, account_id,
           happened_on, status, note, created_at, updated_at)
         VALUES
          ('loan_existing', 'receivable', 'mc', '3000.00', '1500.00', '0.00', 'acct_wechat',
           '2021-04-03', 'open', 'mc', ?, ?)`
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO loan_entries (id, loan_id, type, amount, account_id, book_id, happened_on, note, transaction_id, created_at, updated_at) VALUES ('entry_repayment', 'loan_existing', 'repayment', '1500.00', 'acct_wechat', 'default', '2026-05-31', 'partial', NULL, ?, ?)"
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO transactions (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, note, raw_payload, created_at, updated_at) VALUES ('txn_principal', 'loan', '2021-04-03', '-3000.00', '3000.00', 'acct_wechat', NULL, 'default', 'mc', ?, ?, ?)"
      )
      .run(JSON.stringify({ "\u8d26\u76ee\u5206\u7c7b": "\u501f\u51fa", "\u6210\u5458": "mc" }), now, now);

    const summary = repairImportedData({ now });

    expect(summary.after.orphanLoanTransactions).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM loans").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT loan_id AS loanId FROM transactions WHERE id = 'txn_principal'").get()).toEqual({
      loanId: "loan_existing"
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM loan_entries WHERE loan_id = 'loan_existing' AND type = 'principal' AND transaction_id = 'txn_principal'").get()).toEqual({
      count: 1
    });
    expect(sqlite.prepare("SELECT remaining_amount_cache AS remaining, status FROM loans WHERE id = 'loan_existing'").get()).toEqual({
      remaining: "1500.00",
      status: "open"
    });
  });

  it("attaches an extra orphan receipt to the latest previous closed receivable loan", async () => {
    const { sqlite } = await import("../../db/client.js");
    const { ensureDatabase } = await import("../../db/bootstrap.js");
    const { repairImportedData } = await import("./repair.js");
    ensureDatabase();

    const now = "2026-01-01T00:00:00.000Z";
    sqlite.prepare("DELETE FROM transactions").run();
    sqlite.prepare("DELETE FROM accounts").run();
    sqlite.prepare("DELETE FROM loans").run();
    sqlite.prepare("DELETE FROM loan_entries").run();
    sqlite
      .prepare(
        "INSERT INTO accounts (id, name, type, kind, initial_balance, current_balance_cache, created_at, updated_at) VALUES ('acct_alipay', 'Alipay', 'wallet', 'asset', '0.00', '0.00', ?, ?)"
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO loans
          (id, direction, counterparty, principal_amount, remaining_amount_cache, interest_amount_cache, account_id,
           happened_on, status, note, closed_at, created_at, updated_at)
         VALUES
          ('loan_closed', 'receivable', 'wan', '500.00', '0.00', '0.00', 'acct_alipay',
           '2017-10-01', 'closed', 'wan', ?, ?, ?)`
      )
      .run(now, now, now);
    sqlite
      .prepare(
        "INSERT INTO loan_entries (id, loan_id, type, amount, account_id, book_id, happened_on, note, transaction_id, created_at, updated_at) VALUES ('entry_principal', 'loan_closed', 'principal', '500.00', 'acct_alipay', 'default', '2017-10-01', 'principal', NULL, ?, ?)"
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO loan_entries (id, loan_id, type, amount, account_id, book_id, happened_on, note, transaction_id, created_at, updated_at) VALUES ('entry_repaid', 'loan_closed', 'repayment', '500.00', 'acct_alipay', 'default', '2017-10-20', 'repaid', NULL, ?, ?)"
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO transactions (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, note, raw_payload, created_at, updated_at) VALUES ('txn_extra_receipt', 'loan', '2017-11-06', '300.00', '300.00', 'acct_alipay', NULL, 'default', 'wan', ?, ?, ?)"
      )
      .run(JSON.stringify({ "\u8d26\u76ee\u5206\u7c7b": "\u6536\u6b3e", "\u6210\u5458": "wan" }), now, now);

    const summary = repairImportedData({ now });

    expect(summary.after.orphanLoanTransactions).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM loans").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT loan_id AS loanId FROM transactions WHERE id = 'txn_extra_receipt'").get()).toEqual({
      loanId: "loan_closed"
    });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM loan_entries WHERE loan_id = 'loan_closed' AND type = 'repayment' AND transaction_id = 'txn_extra_receipt'").get()).toEqual({
      count: 1
    });
    expect(sqlite.prepare("SELECT remaining_amount_cache AS remaining, status FROM loans WHERE id = 'loan_closed'").get()).toEqual({
      remaining: "0.00",
      status: "closed"
    });
  });
});
