import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString())
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  ...timestamps
});

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
  ...timestamps
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  archivedAt: text("archived_at"),
  ...timestamps
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    kind: text("kind").notNull(),
    initialBalance: text("initial_balance").notNull().default("0"),
    currentBalanceCache: text("current_balance_cache").notNull().default("0"),
    currency: text("currency").notNull().default("CNY"),
    color: text("color").notNull().default("#5B7CFA"),
    icon: text("icon").notNull().default("wallet"),
    includeInAssets: integer("include_in_assets", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    archivedAt: text("archived_at"),
    ...timestamps
  },
  (table) => [
    index("accounts_name_idx").on(table.name),
    index("accounts_kind_idx").on(table.kind)
  ]
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    parentId: text("parent_id"),
    icon: text("icon").notNull().default("circle"),
    color: text("color").notNull().default("#8FD8F7"),
    sortOrder: integer("sort_order").notNull().default(0),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    archivedAt: text("archived_at"),
    ...timestamps
  },
  (table) => [
    index("categories_type_idx").on(table.type),
    uniqueIndex("categories_name_type_unique").on(table.name, table.type)
  ]
);

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  source: text("source").notNull().default("pocket_accounting"),
  status: text("status").notNull().default("pending"),
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsSuccess: integer("rows_success").notNull().default(0),
  rowsWarning: integer("rows_warning").notNull().default(0),
  rowsFailed: integer("rows_failed").notNull().default(0),
  summary: text("summary"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString())
});

export const transfers = sqliteTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    happenedOn: text("happened_on").notNull(),
    amount: text("amount").notNull(),
    fromAccountId: text("from_account_id").notNull(),
    toAccountId: text("to_account_id").notNull(),
    note: text("note"),
    bookId: text("book_id"),
    importBatchId: text("import_batch_id"),
    deletedAt: text("deleted_at"),
    ...timestamps
  },
  (table) => [
    index("transfers_happened_on_idx").on(table.happenedOn)
  ]
);

export const loans = sqliteTable(
  "loans",
  {
    id: text("id").primaryKey(),
    direction: text("direction").notNull(),
    counterparty: text("counterparty").notNull(),
    principalAmount: text("principal_amount").notNull(),
    remainingAmountCache: text("remaining_amount_cache").notNull().default("0"),
    interestAmountCache: text("interest_amount_cache").notNull().default("0"),
    accountId: text("account_id"),
    happenedOn: text("happened_on").notNull(),
    dueOn: text("due_on"),
    reminderEnabled: integer("reminder_enabled", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("open"),
    note: text("note"),
    importBatchId: text("import_batch_id"),
    closedAt: text("closed_at"),
    deletedAt: text("deleted_at"),
    ...timestamps
  },
  (table) => [
    index("loans_counterparty_idx").on(table.counterparty),
    index("loans_status_idx").on(table.status)
  ]
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    happenedOn: text("happened_on").notNull(),
    amount: text("amount").notNull(),
    displayAmount: text("display_amount").notNull(),
    accountId: text("account_id").notNull(),
    categoryId: text("category_id"),
    bookId: text("book_id"),
    memberId: text("member_id"),
    note: text("note"),
    transferId: text("transfer_id"),
    loanId: text("loan_id"),
    importBatchId: text("import_batch_id"),
    sourceRowHash: text("source_row_hash"),
    rawPayload: text("raw_payload"),
    deletedAt: text("deleted_at"),
    ...timestamps
  },
  (table) => [
    index("transactions_happened_on_idx").on(table.happenedOn),
    index("transactions_account_id_idx").on(table.accountId),
    index("transactions_category_id_idx").on(table.categoryId),
    index("transactions_source_row_hash_idx").on(table.sourceRowHash)
  ]
);

export const loanEntries = sqliteTable(
  "loan_entries",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id").notNull(),
    type: text("type").notNull(),
    amount: text("amount").notNull(),
    accountId: text("account_id"),
    bookId: text("book_id"),
    happenedOn: text("happened_on").notNull(),
    note: text("note"),
    transactionId: text("transaction_id"),
    ...timestamps
  },
  (table) => [
    index("loan_entries_loan_id_idx").on(table.loanId),
    index("loan_entries_happened_on_idx").on(table.happenedOn)
  ]
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    month: text("month").notNull(),
    totalAmount: text("total_amount").notNull().default("0"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    displayMode: text("display_mode").notNull().default("remaining"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("budgets_month_unique").on(table.month)
  ]
);

export const budgetCategories = sqliteTable(
  "budget_categories",
  {
    id: text("id").primaryKey(),
    budgetId: text("budget_id").notNull(),
    categoryId: text("category_id").notNull(),
    amount: text("amount").notNull().default("0"),
    ...timestamps
  },
  (table) => [
    index("budget_categories_budget_id_idx").on(table.budgetId)
  ]
);

export const importWarnings = sqliteTable(
  "import_warnings",
  {
    id: text("id").primaryKey(),
    importBatchId: text("import_batch_id").notNull(),
    sheetName: text("sheet_name").notNull(),
    rowNumber: integer("row_number").notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
    rawPayload: text("raw_payload"),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("import_warnings_batch_id_idx").on(table.importBatchId)
  ]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const clearLogs = sqliteTable("clear_logs", {
  id: text("id").primaryKey(),
  safetyBackup: text("safety_backup").notNull(),
  clearedAt: text("cleared_at").notNull(),
  confirmation: text("confirmation").notNull()
});
