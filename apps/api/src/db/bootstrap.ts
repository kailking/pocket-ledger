import { sqlite } from "./client.js";

const now = () => new Date().toISOString();

const defaultAccounts = [
  { id: "cash", name: "现金", type: "cash", kind: "asset", balance: "52260.00", color: "#58B982", icon: "badge-yen-sign" },
  { id: "debit", name: "储蓄卡", type: "debit_card", kind: "asset", balance: "25.45", color: "#5F9FD0", icon: "credit-card" },
  { id: "wechat", name: "微信", type: "wechat", kind: "asset", balance: "95.38", color: "#9DBA57", icon: "wallet" },
  { id: "alipay", name: "支付宝", type: "alipay", kind: "asset", balance: "40368.81", color: "#F1C66B", icon: "wallet" },
  { id: "cgb", name: "广发银行", type: "debit_card", kind: "asset", balance: "9393.86", color: "#C9716B", icon: "landmark" },
  { id: "huobi", name: "火币", type: "cash", kind: "asset", balance: "843595.51", color: "#43A3C8", icon: "badge-yen-sign" },
  { id: "ltc", name: "ltc", type: "investment", kind: "asset", balance: "1591399.00", color: "#5C89C8", icon: "receipt-text" },
  { id: "citic", name: "中信银行", type: "debit_card", kind: "asset", balance: "120242.53", color: "#C86464", icon: "landmark" }
];

const defaultCategories = [
  { id: "general", name: "一般", type: "expense", icon: "star", color: "#8FD8F7", sort: 1 },
  { id: "food", name: "餐饮饮料", type: "expense", icon: "utensils", color: "#FFC76F", sort: 2 },
  { id: "traffic", name: "交通出行", type: "expense", icon: "bus-front", color: "#98AAFF", sort: 3 },
  { id: "wine", name: "烟茶酒水", type: "expense", icon: "wine", color: "#8ABEF0", sort: 4 },
  { id: "home", name: "房租房费", type: "expense", icon: "home", color: "#8ABBE5", sort: 5 },
  { id: "project", name: "项目运营成本", type: "expense", icon: "briefcase-business", color: "#2E9BDE", sort: 6 },
  { id: "fuel", name: "加油", type: "expense", icon: "fuel", color: "#74CFC5", sort: 7 },
  { id: "travel", name: "旅行", type: "expense", icon: "plane", color: "#B4A0DF", sort: 8 },
  { id: "gift", name: "红包", type: "expense", icon: "gift", color: "#FF8F98", sort: 9 },
  { id: "install", name: "源码安装", type: "income", icon: "briefcase-business", color: "#5CB5CE", sort: 1 },
  { id: "refund", name: "退款", type: "income", icon: "hand-coins", color: "#8BE0B2", sort: 2 },
  { id: "invest", name: "投资收入", type: "income", icon: "circle-dollar-sign", color: "#D66D1E", sort: 3 },
  { id: "income_cash", name: "现金", type: "income", icon: "wallet", color: "#C7847A", sort: 4 },
  { id: "bonus", name: "红包", type: "income", icon: "gift", color: "#FF8F98", sort: 5 },
  { id: "transfer", name: "转账", type: "expense", icon: "banknote-arrow-down", color: "#5CB5CE", sort: 99 }
];

const defaultMembers = ["我", "项目花费", "鼠", "智", "辉", "国威"];

const defaultTransactions = [
  {
    id: "seed_income_1",
    type: "income",
    happenedOn: "2026-05-31",
    amount: "7213.00",
    accountId: "alipay",
    categoryId: "install",
    memberId: "member_me",
    note: "反佣"
  },
  {
    id: "seed_expense_1",
    type: "expense",
    happenedOn: "2026-05-30",
    amount: "-2000.00",
    accountId: "alipay",
    categoryId: "home",
    memberId: "member_me",
    note: ""
  },
  {
    id: "seed_expense_2",
    type: "expense",
    happenedOn: "2026-05-30",
    amount: "-998.92",
    accountId: "citic",
    categoryId: "project",
    memberId: "member_me",
    note: "Claude code"
  },
  {
    id: "seed_expense_3",
    type: "expense",
    happenedOn: "2026-05-29",
    amount: "-361.45",
    accountId: "wechat",
    categoryId: "gift",
    memberId: "member_me",
    note: ""
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
    CREATE INDEX IF NOT EXISTS budget_categories_budget_id_idx ON budget_categories(budget_id);
    CREATE INDEX IF NOT EXISTS import_batches_created_at_idx ON import_batches(created_at);
  `);

  if (!columnExists("users", "must_change_password")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1");
  }
  if (!columnExists("accounts", "sort_order")) {
    sqlite.exec("ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  }

  const created = now();

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
