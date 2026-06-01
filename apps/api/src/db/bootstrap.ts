import { sqlite } from "./client.js";

const now = () => new Date().toISOString();

const defaultAccounts = [
  { id: "cash", name: "现金钱包", type: "cash", kind: "asset", balance: "3200.00", color: "#58B982", icon: "badge-yen-sign" },
  { id: "debit", name: "储蓄卡", type: "debit_card", kind: "asset", balance: "12000.00", color: "#5F9FD0", icon: "credit-card" },
  { id: "wallet", name: "移动钱包", type: "wallet", kind: "asset", balance: "860.00", color: "#9DBA57", icon: "wallet" },
  { id: "reserve", name: "备用账户", type: "custom", kind: "asset", balance: "1500.00", color: "#F1C66B", icon: "wallet" },
  { id: "demo_bank_a", name: "演示银行卡 A", type: "debit_card", kind: "asset", balance: "4200.00", color: "#C9716B", icon: "landmark" },
  { id: "investment", name: "投资账户", type: "investment", kind: "asset", balance: "8000.00", color: "#43A3C8", icon: "badge-yen-sign" },
  { id: "fund", name: "基金账户", type: "investment", kind: "asset", balance: "5200.00", color: "#5C89C8", icon: "receipt-text" },
  { id: "credit", name: "信用卡", type: "credit_card", kind: "liability", balance: "2800.00", color: "#C86464", icon: "landmark" }
];

const defaultCategories = [
  { id: "general", name: "一般", type: "expense", icon: "star", color: "#8FD8F7", sort: 1 },
  { id: "food", name: "餐饮饮料", type: "expense", icon: "utensils", color: "#FFC76F", sort: 2 },
  { id: "traffic", name: "交通出行", type: "expense", icon: "bus-front", color: "#98AAFF", sort: 3 },
  { id: "shopping", name: "日用购物", type: "expense", icon: "shopping-bag", color: "#8ABEF0", sort: 4 },
  { id: "home", name: "居家生活", type: "expense", icon: "home", color: "#8ABBE5", sort: 5 },
  { id: "software", name: "软件服务", type: "expense", icon: "briefcase-business", color: "#2E9BDE", sort: 6 },
  { id: "fuel", name: "加油", type: "expense", icon: "fuel", color: "#74CFC5", sort: 7 },
  { id: "travel", name: "旅行", type: "expense", icon: "plane", color: "#B4A0DF", sort: 8 },
  { id: "gift", name: "礼品人情", type: "expense", icon: "gift", color: "#FF8F98", sort: 9 },
  { id: "salary", name: "工资收入", type: "income", icon: "briefcase-business", color: "#5CB5CE", sort: 1 },
  { id: "refund", name: "退款", type: "income", icon: "hand-coins", color: "#8BE0B2", sort: 2 },
  { id: "invest", name: "投资收入", type: "income", icon: "circle-dollar-sign", color: "#D66D1E", sort: 3 },
  { id: "income_cash", name: "现金", type: "income", icon: "wallet", color: "#C7847A", sort: 4 },
  { id: "bonus", name: "红包", type: "income", icon: "gift", color: "#FF8F98", sort: 5 },
  { id: "transfer", name: "转账", type: "expense", icon: "banknote-arrow-down", color: "#5CB5CE", sort: 99 }
];

const defaultMembers = ["我", "家庭", "项目", "演示成员"];
const defaultReceivableGroupId = "loan_group_receivable_default";
const defaultPayableGroupId = "loan_group_payable_default";

const defaultTransactions = [
  {
    id: "seed_income_1",
    type: "income",
    happenedOn: "2026-06-01",
    amount: "8000.00",
    accountId: "debit",
    categoryId: "salary",
    memberId: "member_me",
    note: "月度收入"
  },
  {
    id: "seed_expense_1",
    type: "expense",
    happenedOn: "2026-06-01",
    amount: "-56.80",
    accountId: "cash",
    categoryId: "food",
    memberId: "member_me",
    note: "午餐"
  },
  {
    id: "seed_expense_2",
    type: "expense",
    happenedOn: "2026-05-31",
    amount: "-128.00",
    accountId: "debit",
    categoryId: "software",
    memberId: "member_me",
    note: "订阅服务"
  },
  {
    id: "seed_expense_3",
    type: "expense",
    happenedOn: "2026-05-30",
    amount: "-480.00",
    accountId: "reserve",
    categoryId: "home",
    memberId: "member_me",
    note: "居家用品"
  },
  {
    id: "seed_expense_4",
    type: "expense",
    happenedOn: "2026-05-30",
    amount: "-24.00",
    accountId: "wallet",
    categoryId: "traffic",
    memberId: "member_me",
    note: "地铁"
  }
];

function columnExists(tableName: string, columnName: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function tableExists(tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row);
}

export function ensureDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      kind TEXT NOT NULL,
      initial_balance TEXT NOT NULL DEFAULT '0',
      current_balance_cache TEXT NOT NULL DEFAULT '0',
      currency TEXT NOT NULL DEFAULT 'CNY',
      color TEXT NOT NULL DEFAULT '#5B7CFA',
      icon TEXT NOT NULL DEFAULT 'wallet',
      include_in_assets INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_id TEXT,
      icon TEXT NOT NULL DEFAULT 'circle',
      color TEXT NOT NULL DEFAULT '#8FD8F7',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      happened_on TEXT NOT NULL,
      amount TEXT NOT NULL,
      from_account_id TEXT NOT NULL,
      to_account_id TEXT NOT NULL,
      note TEXT,
      book_id TEXT,
      import_batch_id TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      happened_on TEXT NOT NULL,
      amount TEXT NOT NULL,
      display_amount TEXT NOT NULL,
      account_id TEXT NOT NULL,
      category_id TEXT,
      book_id TEXT,
      member_id TEXT,
      note TEXT,
      transfer_id TEXT,
      loan_id TEXT,
      import_batch_id TEXT,
      source_row_hash TEXT,
      raw_payload TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      loan_group_id TEXT,
      counterparty TEXT NOT NULL,
      principal_amount TEXT NOT NULL DEFAULT '0',
      remaining_amount_cache TEXT NOT NULL DEFAULT '0',
      interest_amount_cache TEXT NOT NULL DEFAULT '0',
      account_id TEXT,
      happened_on TEXT NOT NULL,
      due_on TEXT,
      reminder_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      note TEXT,
      import_batch_id TEXT,
      deleted_at TEXT,
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'receivable',
      color TEXT NOT NULL DEFAULT '#46B98F',
      icon TEXT NOT NULL DEFAULT 'hand-coins',
      include_in_assets INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_entries (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount TEXT NOT NULL,
      account_id TEXT,
      book_id TEXT,
      happened_on TEXT NOT NULL,
      note TEXT,
      transaction_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL UNIQUE,
      total_amount TEXT NOT NULL DEFAULT '0',
      enabled INTEGER NOT NULL DEFAULT 0,
      display_mode TEXT NOT NULL DEFAULT 'remaining',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_categories (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      amount TEXT NOT NULL DEFAULT '0',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      rows_total INTEGER NOT NULL DEFAULT 0,
      rows_success INTEGER NOT NULL DEFAULT 0,
      rows_warning INTEGER NOT NULL DEFAULT 0,
      rows_failed INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_warnings (
      id TEXT PRIMARY KEY,
      import_batch_id TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      raw_payload TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clear_logs (
      id TEXT PRIMARY KEY,
      safety_backup TEXT NOT NULL,
      cleared_at TEXT NOT NULL,
      confirmation TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS transactions_happened_on_idx ON transactions(happened_on);
    CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS transactions_type_idx ON transactions(type);
    CREATE INDEX IF NOT EXISTS transactions_account_happened_idx ON transactions(account_id, happened_on);
    CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS loans_happened_on_idx ON loans(happened_on);
    CREATE INDEX IF NOT EXISTS loans_group_idx ON loans(loan_group_id);
    CREATE INDEX IF NOT EXISTS loan_groups_direction_idx ON loan_groups(direction);
    CREATE INDEX IF NOT EXISTS budget_categories_budget_id_idx ON budget_categories(budget_id);
    CREATE INDEX IF NOT EXISTS import_batches_created_at_idx ON import_batches(created_at);
  `);

  if (!columnExists("users", "must_change_password")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1");
  }
  if (!columnExists("accounts", "sort_order")) {
    sqlite.exec("ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists("loans", "loan_group_id")) {
    sqlite.exec("ALTER TABLE loans ADD COLUMN loan_group_id TEXT");
  }

  const created = now();
  const legacyReceivableVisible = (() => {
    const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'assets.receivable.visible' LIMIT 1").get() as
      | { value: string }
      | undefined;
    if (!row) return 1;
    try {
      return JSON.parse(row.value) === false ? 0 : 1;
    } catch {
      return 1;
    }
  })();
  const insertLoanGroup = sqlite.prepare(`
    INSERT OR IGNORE INTO loan_groups
      (id, name, direction, color, icon, include_in_assets, sort_order, is_default, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  insertLoanGroup.run(defaultReceivableGroupId, "应收账", "receivable", "#46B98F", "hand-coins", legacyReceivableVisible, 10, created, created);
  insertLoanGroup.run(defaultPayableGroupId, "应付账", "payable", "#C86464", "receipt-text", 0, 10, created, created);
  sqlite
    .prepare("UPDATE loans SET loan_group_id = ? WHERE loan_group_id IS NULL AND direction = 'receivable'")
    .run(defaultReceivableGroupId);
  sqlite
    .prepare("UPDATE loans SET loan_group_id = ? WHERE loan_group_id IS NULL AND direction = 'payable'")
    .run(defaultPayableGroupId);

  if (tableExists("accounts")) {
    const activeAccounts = sqlite
      .prepare(
        `
        SELECT id, sort_order AS sortOrder
        FROM accounts
        WHERE hidden = 0
        ORDER BY kind, name, created_at
      `
      )
      .all() as Array<{ id: string; sortOrder: number }>;
    const needsBackfill = activeAccounts.length > 0 && activeAccounts.every((account) => account.sortOrder === 0);
    if (needsBackfill) {
      const updateSort = sqlite.prepare("UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?");
      activeAccounts.forEach((account, index) => updateSort.run((index + 1) * 10, created, account.id));
    }
  }

  sqlite.prepare(`
    INSERT OR IGNORE INTO books (id, name, is_default, created_at, updated_at)
    VALUES ('default', '默认账本', 1, ?, ?)
  `).run(created, created);

  const insertMember = sqlite.prepare(`
    INSERT OR IGNORE INTO members (id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  defaultMembers.forEach((name, index) => {
    insertMember.run(index === 0 ? "member_me" : `member_${index}`, name, created, created);
  });

  const insertAccount = sqlite.prepare(`
    INSERT OR IGNORE INTO accounts
      (id, name, type, kind, initial_balance, current_balance_cache, color, icon, include_in_assets, sort_order, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);
  defaultAccounts.forEach((account) => {
    insertAccount.run(
      account.id,
      account.name,
      account.type,
      account.kind,
      account.balance,
      account.balance,
      account.color,
      account.icon,
      (defaultAccounts.indexOf(account) + 1) * 10,
      created,
      created
    );
  });

  const insertCategory = sqlite.prepare(`
    INSERT OR IGNORE INTO categories
      (id, name, type, icon, color, sort_order, is_system, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  defaultCategories.forEach((category) => {
    insertCategory.run(category.id, category.name, category.type, category.icon, category.color, category.sort, created, created);
  });

  const count = sqlite.prepare("SELECT COUNT(*) AS count FROM transactions").get() as { count: number };
  if (count.count === 0) {
    const insertTransaction = sqlite.prepare(`
      INSERT INTO transactions
        (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, 'default', ?, ?, ?, ?)
    `);
    defaultTransactions.forEach((transaction) => {
      insertTransaction.run(
        transaction.id,
        transaction.type,
        transaction.happenedOn,
        transaction.amount,
        Math.abs(Number(transaction.amount)).toFixed(2),
        transaction.accountId,
        transaction.categoryId,
        transaction.memberId,
        transaction.note,
        created,
        created
      );
    });
  }
}
