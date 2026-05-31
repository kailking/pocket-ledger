import path from "node:path";
import process from "node:process";

import Database from "better-sqlite3";

function sqlitePathFromUrl(value) {
  const withoutScheme = value.startsWith("file:") ? value.slice("file:".length) : value;
  return path.isAbsolute(withoutScheme) ? withoutScheme : path.resolve(process.cwd(), withoutScheme);
}

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/app.db";
const dbPath = sqlitePathFromUrl(databaseUrl);
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const checks = [
  {
    name: "category_mismatch",
    description: "income/expense transactions must reference a category with the same type",
    sql: `
      SELECT
        t.id,
        t.type AS transaction_type,
        t.category_id,
        c.type AS category_type,
        t.happened_on,
        t.amount,
        t.note
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL
        AND t.type IN ('income', 'expense')
        AND (t.category_id IS NULL OR c.id IS NULL OR c.type <> t.type)
      ORDER BY t.happened_on DESC, t.created_at DESC
    `
  },
  {
    name: "orphan_loan_transactions",
    description: "loan transactions must always keep loan_id",
    sql: `
      SELECT id, happened_on, amount, account_id, note
      FROM transactions
      WHERE deleted_at IS NULL
        AND type = 'loan'
        AND loan_id IS NULL
      ORDER BY happened_on DESC, created_at DESC
    `
  },
  {
    name: "loan_status_remaining_mismatch",
    description: "closed loans require zero remaining_amount_cache; open loans require non-zero remaining_amount_cache",
    sql: `
      SELECT id, status, remaining_amount_cache, counterparty, happened_on
      FROM loans
      WHERE deleted_at IS NULL
        AND (
          (status = 'closed' AND ROUND(CAST(remaining_amount_cache AS REAL), 2) <> 0)
          OR
          (status = 'open' AND ROUND(CAST(remaining_amount_cache AS REAL), 2) = 0)
        )
      ORDER BY happened_on DESC, created_at DESC
    `
  },
  {
    name: "loan_remaining_recalculation_mismatch",
    description: "remaining_amount_cache should equal max(principal + additional - repayment, 0) from loan_entries",
    sql: `
      WITH entry_totals AS (
        SELECT
          l.id AS loan_id,
          COALESCE(SUM(CASE WHEN e.type = 'principal' THEN CAST(e.amount AS REAL) ELSE 0 END), 0) AS principal_entries,
          COALESCE(SUM(CASE WHEN e.type = 'additional' THEN CAST(e.amount AS REAL) ELSE 0 END), 0) AS additional_entries,
          COALESCE(SUM(CASE WHEN e.type = 'repayment' THEN CAST(e.amount AS REAL) ELSE 0 END), 0) AS repayment_entries
        FROM loans l
        LEFT JOIN loan_entries e ON e.loan_id = l.id
        WHERE l.deleted_at IS NULL
        GROUP BY l.id
      )
      SELECT
        l.id,
        l.status,
        l.principal_amount,
        l.remaining_amount_cache,
        ROUND(MAX(
          CASE WHEN et.principal_entries > 0 THEN et.principal_entries ELSE CAST(l.principal_amount AS REAL) END
          + et.additional_entries
          - et.repayment_entries,
          0
        ), 2) AS expected_remaining,
        l.counterparty,
        l.happened_on
      FROM loans l
      JOIN entry_totals et ON et.loan_id = l.id
      WHERE l.deleted_at IS NULL
        AND ROUND(CAST(l.remaining_amount_cache AS REAL), 2) <> ROUND(MAX(
          CASE WHEN et.principal_entries > 0 THEN et.principal_entries ELSE CAST(l.principal_amount AS REAL) END
          + et.additional_entries
          - et.repayment_entries,
          0
        ), 2)
      ORDER BY l.happened_on DESC, l.created_at DESC
    `
  }
];

let failed = false;
const summary = {};

console.log(`SQLite audit database: ${dbPath}`);

for (const check of checks) {
  const rows = db.prepare(check.sql).all();
  summary[check.name] = rows.length;
  const status = rows.length === 0 ? "PASS" : "FAIL";
  console.log(`\n[${status}] ${check.name}: ${check.description}`);
  console.log(`rows=${rows.length}`);
  if (rows.length > 0) {
    failed = true;
    console.table(rows.slice(0, 20));
    if (rows.length > 20) {
      console.log(`... ${rows.length - 20} more rows omitted`);
    }
  }
}

console.log("\nSummary:");
console.table(summary);

db.close();
process.exitCode = failed ? 1 : 0;
