import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sqlite } from "../../db/client.js";
import { createId } from "../../utils/id.js";
import { badRequest, notFound, ok } from "../../utils/http.js";

type EditableTransactionType = "income" | "expense";
type StoredTransactionType = EditableTransactionType | "balance_adjustment" | "loan";
type ListTransactionType = StoredTransactionType | "transfer";

type TransactionRow = {
  id: string;
  type: StoredTransactionType;
  happenedOn: string;
  amount: string;
  displayAmount: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  memberId: string | null;
  memberName: string | null;
  note: string | null;
  bookId: string | null;
  transferId: string | null;
  loanId: string | null;
  createdAt: string;
  updatedAt: string;
};

type TransferRow = {
  id: string;
  happenedOn: string;
  amount: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  memberId: string | null;
  memberName: string | null;
  note: string | null;
  bookId: string | null;
  createdAt: string;
  updatedAt: string;
};

type BillRow =
  | { kind: "transaction"; row: TransactionRow }
  | { kind: "transfer"; row: TransferRow };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createTransactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  happenedOn: dateSchema,
  amount: z.coerce.number().positive(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  account: z.string().optional(),
  memberId: z.string().optional(),
  member: z.string().optional(),
  note: z.string().optional(),
  fromAccountId: z.string().optional(),
  fromAccount: z.string().optional(),
  toAccountId: z.string().optional(),
  toAccount: z.string().optional()
});

const updateTransactionSchema = createTransactionSchema.partial();

const paramsSchema = z.object({
  id: z.string().min(1)
});

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyStringToUndefined, z.string().trim().optional());
const optionalDate = z.preprocess(emptyStringToUndefined, dateSchema.optional());
const optionalNumber = z.preprocess(emptyStringToUndefined, z.coerce.number().nonnegative().optional());

const listQuerySchema = z
  .object({
    q: optionalString,
    keyword: optionalString,
    type: z.preprocess(
      emptyStringToUndefined,
      z.enum(["income", "expense", "transfer", "balance_adjustment", "loan"]).optional()
    ),
    startDate: optionalDate,
    endDate: optionalDate,
    dateFrom: optionalDate,
    dateTo: optionalDate,
    from: optionalDate,
    to: optionalDate,
    accountId: optionalString,
    categoryId: optionalString,
    memberId: optionalString,
    minAmount: optionalNumber,
    maxAmount: optionalNumber,
    limit: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(500).default(200)),
    offset: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(0).default(0))
  })
  .transform((query) => ({
    ...query,
    keyword: query.keyword ?? query.q,
    startDate: query.startDate ?? query.dateFrom ?? query.from,
    endDate: query.endDate ?? query.dateTo ?? query.to
  }));

type CreateTransactionPayload = z.infer<typeof createTransactionSchema>;
type UpdateTransactionPayload = z.infer<typeof updateTransactionSchema>;
type ListQuery = z.infer<typeof listQuerySchema>;

function dateLabel(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (date === today) return "今天";
  return `${Number(date.slice(8, 10))}日`;
}

function defaultCategoryId(type: EditableTransactionType): string {
  const row = sqlite
    .prepare("SELECT id FROM categories WHERE type = ? AND hidden = 0 AND archived_at IS NULL ORDER BY sort_order LIMIT 1")
    .get(type) as { id: string } | undefined;
  if (!row) throw badRequest(`缺少${type}分类`);
  return row.id;
}

function accountIdByInput({
  id,
  name,
  fallbackId
}: {
  id?: string | undefined;
  name?: string | undefined;
  fallbackId: string;
}): string {
  if (id) {
    const row = sqlite.prepare("SELECT id FROM accounts WHERE id = ? AND archived_at IS NULL").get(id) as
      | { id: string }
      | undefined;
    if (!row) throw badRequest(`账户不存在：${id}`);
    return row.id;
  }

  if (!name) return fallbackId;

  const row = sqlite.prepare("SELECT id FROM accounts WHERE name = ? AND archived_at IS NULL").get(name) as
    | { id: string }
    | undefined;
  if (!row) throw badRequest(`账户不存在：${name}`);
  return row.id;
}

function categoryIdByInput(id: string | undefined, type: EditableTransactionType, fallbackId?: string | null): string {
  if (!id) {
    if (fallbackId) return fallbackId;
    return defaultCategoryId(type);
  }

  const row = sqlite
    .prepare("SELECT id FROM categories WHERE id = ? AND type = ? AND hidden = 0 AND archived_at IS NULL")
    .get(id, type) as { id: string } | undefined;

  if (!row) throw badRequest(`分类不存在：${id}`);
  return row.id;
}

function memberIdByName(name?: string): string | null {
  if (!name) return null;
  const row = sqlite.prepare("SELECT id FROM members WHERE name = ? AND archived_at IS NULL").get(name) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

function memberIdByInput(id?: string, name?: string): string | null {
  if (id) {
    const row = sqlite.prepare("SELECT id FROM members WHERE id = ? AND archived_at IS NULL").get(id) as
      | { id: string }
      | undefined;
    if (!row) throw badRequest(`成员不存在：${id}`);
    return row.id;
  }

  return memberIdByName(name);
}

function signedAmount(type: EditableTransactionType, amount: number): string {
  return (type === "expense" ? -amount : amount).toFixed(2);
}

function assertValidListQuery(query: ListQuery) {
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    throw badRequest("startDate cannot be after endDate");
  }

  if (query.minAmount !== undefined && query.maxAmount !== undefined && query.minAmount > query.maxAmount) {
    throw badRequest("minAmount cannot be greater than maxAmount");
  }
}

function transactionSelectSql(whereSql: string) {
  return `
    SELECT
      t.id,
      t.type,
      t.happened_on AS happenedOn,
      t.amount,
      t.display_amount AS displayAmount,
      t.account_id AS accountId,
      a.name AS accountName,
      t.category_id AS categoryId,
      c.name AS categoryName,
      c.icon AS categoryIcon,
      c.color AS categoryColor,
      t.member_id AS memberId,
      m.name AS memberName,
      t.note,
      t.book_id AS bookId,
      t.transfer_id AS transferId,
      t.loan_id AS loanId,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN members m ON m.id = t.member_id
    ${whereSql}
  `;
}

function transferSelectSql(whereSql: string) {
  return `
    SELECT
      tr.id,
      tr.happened_on AS happenedOn,
      tr.amount,
      tr.from_account_id AS fromAccountId,
      af.name AS fromAccountName,
      tr.to_account_id AS toAccountId,
      at.name AS toAccountName,
      tx.member_id AS memberId,
      m.name AS memberName,
      tr.note,
      tr.book_id AS bookId,
      tr.created_at AS createdAt,
      tr.updated_at AS updatedAt
    FROM transfers tr
    JOIN accounts af ON af.id = tr.from_account_id
    JOIN accounts at ON at.id = tr.to_account_id
    LEFT JOIN transactions tx ON tx.transfer_id = tr.id AND tx.type = 'transfer_out' AND tx.deleted_at IS NULL
    LEFT JOIN members m ON m.id = tx.member_id
    ${whereSql}
  `;
}

function getTransactionById(id: string): TransactionRow | undefined {
  return sqlite
    .prepare(
      transactionSelectSql(`
        WHERE t.id = ?
          AND t.deleted_at IS NULL
          AND t.type NOT IN ('transfer_in', 'transfer_out')
      `)
    )
    .get(id) as TransactionRow | undefined;
}

function getTransferById(id: string): TransferRow | undefined {
  return sqlite
    .prepare(
      transferSelectSql(`
        WHERE tr.id = ?
          AND tr.deleted_at IS NULL
      `)
    )
    .get(id) as TransferRow | undefined;
}

function getTransferByTransactionId(id: string): TransferRow | undefined {
  const row = sqlite
    .prepare("SELECT transfer_id AS transferId FROM transactions WHERE id = ? AND deleted_at IS NULL AND transfer_id IS NOT NULL")
    .get(id) as { transferId: string } | undefined;
  return row ? getTransferById(row.transferId) : undefined;
}

function getBillById(id: string): BillRow | undefined {
  const transfer = getTransferById(id) ?? getTransferByTransactionId(id);
  if (transfer) return { kind: "transfer", row: transfer };

  const transaction = getTransactionById(id);
  return transaction ? { kind: "transaction", row: transaction } : undefined;
}

function listTransactionRows(query: ListQuery): TransactionRow[] {
  if (query.type === "transfer") return [];

  const conditions = ["t.deleted_at IS NULL", "t.type NOT IN ('transfer_in', 'transfer_out')"];
  const params: unknown[] = [];

  if (query.type) {
    conditions.push("t.type = ?");
    params.push(query.type);
  }
  if (query.startDate) {
    conditions.push("t.happened_on >= ?");
    params.push(query.startDate);
  }
  if (query.endDate) {
    conditions.push("t.happened_on <= ?");
    params.push(query.endDate);
  }
  if (query.accountId) {
    conditions.push("t.account_id = ?");
    params.push(query.accountId);
  }
  if (query.categoryId) {
    conditions.push("t.category_id = ?");
    params.push(query.categoryId);
  }
  if (query.memberId) {
    conditions.push("t.member_id = ?");
    params.push(query.memberId);
  }
  if (query.minAmount !== undefined) {
    conditions.push("ABS(CAST(t.amount AS REAL)) >= ?");
    params.push(query.minAmount);
  }
  if (query.maxAmount !== undefined) {
    conditions.push("ABS(CAST(t.amount AS REAL)) <= ?");
    params.push(query.maxAmount);
  }
  if (query.keyword) {
    conditions.push(`
      LOWER(
        COALESCE(t.note, '') || ' ' ||
        COALESCE(c.name, '') || ' ' ||
        COALESCE(a.name, '') || ' ' ||
        COALESCE(m.name, '')
      ) LIKE ?
    `);
    params.push(`%${query.keyword.toLowerCase()}%`);
  }

  return sqlite
    .prepare(
      transactionSelectSql(`
        WHERE ${conditions.join(" AND ")}
        ORDER BY t.happened_on DESC, t.created_at DESC
      `)
    )
    .all(...params) as TransactionRow[];
}

function listTransferRows(query: ListQuery): TransferRow[] {
  if (query.type && query.type !== "transfer") return [];
  if (query.categoryId && query.categoryId !== "transfer") return [];

  const conditions = ["tr.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (query.startDate) {
    conditions.push("tr.happened_on >= ?");
    params.push(query.startDate);
  }
  if (query.endDate) {
    conditions.push("tr.happened_on <= ?");
    params.push(query.endDate);
  }
  if (query.accountId) {
    conditions.push("(tr.from_account_id = ? OR tr.to_account_id = ?)");
    params.push(query.accountId, query.accountId);
  }
  if (query.memberId) {
    conditions.push("tx.member_id = ?");
    params.push(query.memberId);
  }
  if (query.minAmount !== undefined) {
    conditions.push("ABS(CAST(tr.amount AS REAL)) >= ?");
    params.push(query.minAmount);
  }
  if (query.maxAmount !== undefined) {
    conditions.push("ABS(CAST(tr.amount AS REAL)) <= ?");
    params.push(query.maxAmount);
  }
  if (query.keyword) {
    conditions.push(`
      LOWER(
        COALESCE(tr.note, '') || ' ' ||
        COALESCE(af.name, '') || ' ' ||
        COALESCE(at.name, '') || ' ' ||
        COALESCE(m.name, '')
      ) LIKE ?
    `);
    params.push(`%${query.keyword.toLowerCase()}%`);
  }

  return sqlite
    .prepare(
      transferSelectSql(`
        WHERE ${conditions.join(" AND ")}
        ORDER BY tr.happened_on DESC, tr.created_at DESC
      `)
    )
    .all(...params) as TransferRow[];
}

function toTransactionListItem(row: TransactionRow) {
  const loanLabel = Number(row.amount) < 0 ? "借贷支出" : "借贷收入";
  const category = row.type === "loan" ? loanLabel : row.type === "balance_adjustment" ? "余额变更" : row.categoryName ?? "一般";
  const icon = row.type === "loan" ? "hand-coins" : row.type === "balance_adjustment" ? "wallet" : row.categoryIcon ?? "star";
  const color = row.type === "loan" ? "#533afd" : row.type === "balance_adjustment" ? "#8A9AB0" : row.categoryColor ?? "#8FD8F7";
  return {
    id: row.id,
    type: row.type as ListTransactionType,
    happenedOn: row.happenedOn,
    dateLabel: dateLabel(row.happenedOn),
    category,
    categoryId: row.categoryId,
    note: row.note ?? "",
    amount: row.amount,
    displayAmount: row.displayAmount,
    account: row.accountName,
    accountId: row.accountId,
    member: row.memberName ?? undefined,
    memberId: row.memberId,
    icon,
    color,
    transferId: row.transferId ?? undefined,
    loanId: row.loanId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toTransferListItem(row: TransferRow) {
  return {
    id: row.id,
    type: "transfer" as const,
    happenedOn: row.happenedOn,
    dateLabel: dateLabel(row.happenedOn),
    category: "转账",
    categoryId: "transfer",
    note: row.note || `${row.fromAccountName} 转入 ${row.toAccountName}`,
    amount: "0.00",
    displayAmount: row.amount,
    transferAmount: row.amount,
    account: `${row.fromAccountName} -> ${row.toAccountName}`,
    fromAccountId: row.fromAccountId,
    fromAccountName: row.fromAccountName,
    toAccountId: row.toAccountId,
    toAccountName: row.toAccountName,
    member: row.memberName ?? undefined,
    memberId: row.memberId,
    icon: "banknote-arrow-down",
    color: "#5CB5CE",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toTransactionDetail(row: TransactionRow) {
  return {
    ...toTransactionListItem(row),
    kind: "transaction" as const,
    bookId: row.bookId,
    amount: row.displayAmount,
    signedAmount: row.amount
  };
}

function toTransferDetail(row: TransferRow) {
  return {
    ...toTransferListItem(row),
    kind: "transfer" as const,
    bookId: row.bookId,
    amount: row.amount
  };
}

function listTransactions(query: ListQuery) {
  assertValidListQuery(query);

  const rows = [
    ...listTransactionRows(query).map(toTransactionListItem),
    ...listTransferRows(query).map(toTransferListItem)
  ].sort((a, b) => {
    const happenedCompare = b.happenedOn.localeCompare(a.happenedOn);
    if (happenedCompare !== 0) return happenedCompare;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return rows.slice(query.offset, query.offset + query.limit);
}

function getTransactionStats() {
  const transactionRow = sqlite
    .prepare(
      `
        SELECT MIN(happened_on) AS firstTransactionDate, COUNT(*) AS transactionCount
        FROM transactions
        WHERE deleted_at IS NULL
          AND type NOT IN ('transfer_in', 'transfer_out')
      `
    )
    .get() as { firstTransactionDate: string | null; transactionCount: number };
  const transferRow = sqlite
    .prepare(
      `
        SELECT MIN(happened_on) AS firstTransferDate, COUNT(*) AS transferCount
        FROM transfers
        WHERE deleted_at IS NULL
      `
    )
    .get() as { firstTransferDate: string | null; transferCount: number };
  const firstTransactionDate = [transactionRow.firstTransactionDate, transferRow.firstTransferDate]
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? null;

  return {
    firstTransactionDate,
    transactionCount: Number(transactionRow.transactionCount ?? 0) + Number(transferRow.transferCount ?? 0)
  };
}

function insertTransfer({
  happenedOn,
  amount,
  fromAccountId,
  toAccountId,
  memberId,
  note,
  bookId = "default",
  created = new Date().toISOString()
}: {
  happenedOn: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  memberId: string | null;
  note: string;
  bookId?: string | null;
  created?: string;
}) {
  const transferId = createId("trf");
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `
        INSERT INTO transfers
          (id, happened_on, amount, from_account_id, to_account_id, note, book_id, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(transferId, happenedOn, amount.toFixed(2), fromAccountId, toAccountId, note, bookId ?? "default", created, created);

    const insert = sqlite.prepare(`
      INSERT INTO transactions
        (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, transfer_id, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      createId("txn"),
      "transfer_out",
      happenedOn,
      (-amount).toFixed(2),
      amount.toFixed(2),
      fromAccountId,
      bookId ?? "default",
      memberId,
      note,
      transferId,
      created,
      created
    );
    insert.run(
      createId("txn"),
      "transfer_in",
      happenedOn,
      amount.toFixed(2),
      amount.toFixed(2),
      toAccountId,
      bookId ?? "default",
      memberId,
      note,
      transferId,
      created,
      created
    );
  })();

  return transferId;
}

function insertTransaction({
  type,
  happenedOn,
  amount,
  accountId,
  categoryId,
  memberId,
  note,
  bookId = "default",
  created = new Date().toISOString()
}: {
  type: EditableTransactionType;
  happenedOn: string;
  amount: number;
  accountId: string;
  categoryId: string;
  memberId: string | null;
  note: string;
  bookId?: string | null;
  created?: string;
}) {
  const transactionId = createId("txn");
  sqlite
    .prepare(
      `
      INSERT INTO transactions
        (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      transactionId,
      type,
      happenedOn,
      signedAmount(type, amount),
      amount.toFixed(2),
      accountId,
      categoryId,
      bookId ?? "default",
      memberId,
      note,
      created,
      created
    );

  return transactionId;
}

function createTransaction(payload: CreateTransactionPayload) {
  if (payload.type === "transfer") {
    const fromAccountId = accountIdByInput({
      id: payload.fromAccountId,
      name: payload.fromAccount,
      fallbackId: "cash"
    });
    const toAccountId = accountIdByInput({
      id: payload.toAccountId,
      name: payload.toAccount,
      fallbackId: "debit"
    });
    if (fromAccountId === toAccountId) {
      throw badRequest("转出账户和转入账户不能相同");
    }

    return insertTransfer({
      happenedOn: payload.happenedOn,
      amount: payload.amount,
      fromAccountId,
      toAccountId,
      memberId: memberIdByInput(payload.memberId, payload.member),
      note: payload.note ?? ""
    });
  }

  const accountId = accountIdByInput({
    id: payload.accountId,
    name: payload.account,
    fallbackId: "cash"
  });
  const categoryId = categoryIdByInput(payload.categoryId, payload.type);

  return insertTransaction({
    type: payload.type,
    happenedOn: payload.happenedOn,
    amount: payload.amount,
    accountId,
    categoryId,
    memberId: memberIdByInput(payload.memberId, payload.member),
    note: payload.note ?? ""
  });
}

function updateTransfer(row: TransferRow, payload: UpdateTransactionPayload) {
  if (payload.type && payload.type !== "transfer") {
    throw badRequest("Changing a transfer into another transaction type is not supported");
  }

  const amount = payload.amount ?? Number(row.amount);
  const happenedOn = payload.happenedOn ?? row.happenedOn;
  const fromAccountId = accountIdByInput({
    id: payload.fromAccountId,
    name: payload.fromAccount,
    fallbackId: row.fromAccountId
  });
  const toAccountId = accountIdByInput({
    id: payload.toAccountId,
    name: payload.toAccount,
    fallbackId: row.toAccountId
  });
  if (fromAccountId === toAccountId) {
    throw badRequest("转出账户和转入账户不能相同");
  }

  const memberId = payload.memberId !== undefined || payload.member !== undefined
    ? memberIdByInput(payload.memberId, payload.member)
    : row.memberId;
  const note = payload.note ?? row.note ?? "";
  const updated = new Date().toISOString();

  sqlite.transaction(() => {
    sqlite
      .prepare(
        `
        UPDATE transfers
        SET happened_on = ?, amount = ?, from_account_id = ?, to_account_id = ?, note = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
      `
      )
      .run(happenedOn, amount.toFixed(2), fromAccountId, toAccountId, note, updated, row.id);

    sqlite
      .prepare(
        `
        UPDATE transactions
        SET happened_on = ?, amount = ?, display_amount = ?, account_id = ?, member_id = ?, note = ?, updated_at = ?
        WHERE transfer_id = ? AND type = 'transfer_out' AND deleted_at IS NULL
      `
      )
      .run(happenedOn, (-amount).toFixed(2), amount.toFixed(2), fromAccountId, memberId, note, updated, row.id);

    sqlite
      .prepare(
        `
        UPDATE transactions
        SET happened_on = ?, amount = ?, display_amount = ?, account_id = ?, member_id = ?, note = ?, updated_at = ?
        WHERE transfer_id = ? AND type = 'transfer_in' AND deleted_at IS NULL
      `
      )
      .run(happenedOn, amount.toFixed(2), amount.toFixed(2), toAccountId, memberId, note, updated, row.id);
  })();

  const updatedRow = getTransferById(row.id);
  if (!updatedRow) throw notFound("Transaction not found");
  return updatedRow;
}

function updateTransaction(row: TransactionRow, payload: UpdateTransactionPayload) {
  if (payload.type === "transfer") {
    throw badRequest("Changing a transaction into a transfer is not supported");
  }
  if (row.type !== "income" && row.type !== "expense") {
    throw badRequest("Only income and expense transactions can be edited");
  }

  const type = payload.type ?? row.type;
  const amount = payload.amount ?? Number(row.displayAmount);
  const happenedOn = payload.happenedOn ?? row.happenedOn;
  const accountId = accountIdByInput({
    id: payload.accountId,
    name: payload.account,
    fallbackId: row.accountId
  });
  const categoryId = payload.categoryId
    ? categoryIdByInput(payload.categoryId, type)
    : categoryIdByInput(undefined, type, type === row.type ? row.categoryId : undefined);
  const memberId = payload.memberId !== undefined || payload.member !== undefined
    ? memberIdByInput(payload.memberId, payload.member)
    : row.memberId;
  const note = payload.note ?? row.note ?? "";
  const updated = new Date().toISOString();

  sqlite
    .prepare(
      `
      UPDATE transactions
      SET type = ?, happened_on = ?, amount = ?, display_amount = ?, account_id = ?, category_id = ?, member_id = ?, note = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `
    )
    .run(type, happenedOn, signedAmount(type, amount), amount.toFixed(2), accountId, categoryId, memberId, note, updated, row.id);

  const updatedRow = getTransactionById(row.id);
  if (!updatedRow) throw notFound("Transaction not found");
  return updatedRow;
}

function duplicateTransaction(row: TransactionRow) {
  const created = new Date().toISOString();
  const id = createId("txn");
  sqlite
    .prepare(
      `
      INSERT INTO transactions
        (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, loan_id, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      row.type,
      row.happenedOn,
      row.amount,
      row.displayAmount,
      row.accountId,
      row.categoryId,
      row.bookId ?? "default",
      row.memberId,
      row.note ?? "",
      row.loanId,
      created,
      created
    );
  return id;
}

export const transactionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = listQuerySchema.parse(request.query);
    return ok(listTransactions(query));
  });

  app.get("/stats", async () => ok(getTransactionStats()));

  app.post("/", async (request) => {
    const payload = createTransactionSchema.parse(request.body);
    return ok({ id: createTransaction(payload) });
  });

  app.get("/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const bill = getBillById(id);
    if (!bill) throw notFound("Transaction not found");
    return ok(bill.kind === "transfer" ? toTransferDetail(bill.row) : toTransactionDetail(bill.row));
  });

  app.put("/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const payload = updateTransactionSchema.parse(request.body);
    const bill = getBillById(id);
    if (!bill) throw notFound("Transaction not found");

    if (bill.kind === "transfer") {
      return ok(toTransferDetail(updateTransfer(bill.row, payload)));
    }
    if (bill.row.type === "loan") {
      throw badRequest("借贷流水请在借贷详情中操作");
    }

    return ok(toTransactionDetail(updateTransaction(bill.row, payload)));
  });

  app.delete("/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const bill = getBillById(id);
    if (!bill) throw notFound("Transaction not found");

    const deleted = new Date().toISOString();
    if (bill.kind === "transfer") {
      sqlite.transaction(() => {
        sqlite.prepare("UPDATE transfers SET deleted_at = ?, updated_at = ? WHERE id = ?").run(deleted, deleted, bill.row.id);
        sqlite
          .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE transfer_id = ? AND deleted_at IS NULL")
          .run(deleted, deleted, bill.row.id);
      })();
      return ok({ id: bill.row.id, type: "transfer", deleted: true });
    }
    if (bill.row.type === "loan") {
      throw badRequest("借贷流水请在借贷详情中删除");
    }

    sqlite
      .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .run(deleted, deleted, bill.row.id);
    return ok({ id: bill.row.id, type: bill.row.type, deleted: true });
  });

  app.post("/:id/duplicate", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const bill = getBillById(id);
    if (!bill) throw notFound("Transaction not found");

    if (bill.kind === "transfer") {
      const transferId = insertTransfer({
        happenedOn: bill.row.happenedOn,
        amount: Number(bill.row.amount),
        fromAccountId: bill.row.fromAccountId,
        toAccountId: bill.row.toAccountId,
        memberId: bill.row.memberId,
        note: bill.row.note ?? "",
        bookId: bill.row.bookId
      });
      return ok({ id: transferId, type: "transfer" });
    }
    if (bill.row.type === "loan") {
      throw badRequest("借贷流水不能复制，请在借贷详情中新增收款或还款");
    }

    return ok({ id: duplicateTransaction(bill.row), type: bill.row.type });
  });
};
