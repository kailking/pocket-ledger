import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sqlite } from "../../db/client.js";
import { badRequest, notFound, ok } from "../../utils/http.js";
import { createId } from "../../utils/id.js";

type LoanDirection = "receivable" | "payable";
type LoanStatus = "open" | "closed";
type LoanEntryType = "principal" | "repayment" | "additional" | "interest";

type LoanRow = {
  id: string;
  direction: LoanDirection;
  loanGroupId: string | null;
  loanGroupName: string | null;
  loanGroupColor: string | null;
  loanGroupIncludeInAssets: 0 | 1 | null;
  counterparty: string;
  principalAmount: string;
  remainingAmount: string;
  interestAmount: string;
  accountId: string | null;
  accountName: string | null;
  happenedOn: string;
  dueOn: string | null;
  status: LoanStatus;
  note: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type LoanGroupRow = {
  id: string;
  name: string;
  direction: LoanDirection;
  color: string;
  icon: string;
  includeInAssets: 0 | 1;
  sortOrder: number;
  isDefault: 0 | 1;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  balance: number;
};

type LoanEntryRow = {
  id: string;
  type: LoanEntryType;
  amount: string;
  accountId: string | null;
  accountName: string | null;
  happenedOn: string;
  note: string | null;
  transactionId: string | null;
  createdAt: string;
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const moneySchema = z.coerce.number().finite().positive("金额必须大于 0");
const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const listQuerySchema = z.object({
  status: z.enum(["open", "closed", "all"]).default("open"),
  direction: z.enum(["receivable", "payable", "all"]).default("all"),
  groupId: z.string().trim().optional(),
  includeHiddenGroups: z.coerce.boolean().default(false),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const groupListQuerySchema = z.object({
  direction: z.enum(["receivable", "payable", "all"]).default("receivable")
});

const groupPayloadSchema = z.object({
  name: z.string().trim().min(1, "请填写分组名称").max(40),
  direction: z.enum(["receivable", "payable"]).default("receivable"),
  color: z.string().trim().min(1).max(40).default("#46B98F"),
  icon: z.string().trim().min(1).max(40).default("hand-coins"),
  includeInAssets: z.coerce.boolean().default(true)
});

const groupUpdateSchema = groupPayloadSchema.partial();

const groupParamsSchema = z.object({
  groupId: z.string().min(1)
});

const createLoanSchema = z.object({
  direction: z.enum(["receivable", "payable"]),
  loanGroupId: z.string().trim().optional(),
  counterparty: z.string().trim().min(1, "请填写借贷对象"),
  principalAmount: moneySchema,
  accountId: z.string().trim().min(1, "请选择使用账户"),
  happenedOn: isoDateSchema.default(() => new Date().toISOString().slice(0, 10)),
  dueOn: optionalText,
  note: optionalText
});

const updateLoanSchema = createLoanSchema.partial();

const createEntrySchema = z.object({
  type: z.enum(["repayment", "additional", "interest"]),
  amount: moneySchema,
  accountId: z.string().trim().min(1, "请选择使用账户"),
  happenedOn: isoDateSchema.default(() => new Date().toISOString().slice(0, 10)),
  note: optionalText
});

const defaultReceivableGroupId = "loan_group_receivable_default";
const defaultPayableGroupId = "loan_group_payable_default";

function toMoney(value: number): string {
  return value.toFixed(2);
}

function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}

function ensureLoanGroups(now = new Date().toISOString()) {
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO loan_groups
      (id, name, direction, color, icon, include_in_assets, sort_order, is_default, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  insert.run(defaultReceivableGroupId, "应收账", "receivable", "#46B98F", "hand-coins", 1, 10, now, now);
  insert.run(defaultPayableGroupId, "应付账", "payable", "#C86464", "receipt-text", 0, 10, now, now);
  sqlite
    .prepare("UPDATE loans SET loan_group_id = ? WHERE loan_group_id IS NULL AND direction = 'receivable'")
    .run(defaultReceivableGroupId);
  sqlite
    .prepare("UPDATE loans SET loan_group_id = ? WHERE loan_group_id IS NULL AND direction = 'payable'")
    .run(defaultPayableGroupId);
}

function defaultGroupId(direction: LoanDirection) {
  return direction === "receivable" ? defaultReceivableGroupId : defaultPayableGroupId;
}

function validateLoanGroup(direction: LoanDirection, groupId?: string | null) {
  ensureLoanGroups();
  const nextGroupId = groupId || defaultGroupId(direction);
  const row = sqlite
    .prepare("SELECT id FROM loan_groups WHERE id = ? AND direction = ? AND archived_at IS NULL LIMIT 1")
    .get(nextGroupId, direction) as { id: string } | undefined;
  if (!row) throw badRequest("应收分组不存在或类型不匹配");
  return row.id;
}

function serializeLoan(row: LoanRow) {
  return {
    ...row,
    loanGroupId: row.loanGroupId ?? defaultGroupId(row.direction),
    loanGroupName: row.loanGroupName ?? (row.direction === "receivable" ? "应收账" : "应付账"),
    loanGroupColor: row.loanGroupColor ?? (row.direction === "receivable" ? "#46B98F" : "#C86464"),
    loanGroupIncludeInAssets: Boolean(row.loanGroupIncludeInAssets ?? (row.direction === "receivable" ? 1 : 0))
  };
}

function readLoanGroups(direction: LoanDirection | "all" = "receivable") {
  ensureLoanGroups();
  const where = ["g.archived_at IS NULL"];
  const params: unknown[] = [];
  if (direction !== "all") {
    where.push("g.direction = ?");
    params.push(direction);
  }
  return sqlite
    .prepare(
      `
      SELECT
        g.id,
        g.name,
        g.direction,
        g.color,
        g.icon,
        g.include_in_assets AS includeInAssets,
        g.sort_order AS sortOrder,
        g.is_default AS isDefault,
        g.archived_at AS archivedAt,
        g.created_at AS createdAt,
        g.updated_at AS updatedAt,
        COALESCE(SUM(CASE
          WHEN l.deleted_at IS NULL AND l.status = 'open'
          THEN CAST(l.remaining_amount_cache AS REAL)
          ELSE 0
        END), 0) AS balance
      FROM loan_groups g
      LEFT JOIN loans l ON COALESCE(l.loan_group_id, CASE l.direction WHEN 'receivable' THEN 'loan_group_receivable_default' ELSE 'loan_group_payable_default' END) = g.id AND l.direction = g.direction
      WHERE ${where.join(" AND ")}
      GROUP BY g.id
      ORDER BY g.sort_order ASC, g.created_at ASC
    `
    )
    .all(...params) as LoanGroupRow[];
}

function serializeLoanGroup(row: LoanGroupRow) {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    color: row.color,
    icon: row.icon,
    includeInAssets: Boolean(row.includeInAssets),
    sortOrder: row.sortOrder,
    isDefault: Boolean(row.isDefault),
    balance: Number(row.balance ?? 0).toFixed(2),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function transactionSignedAmount(direction: LoanDirection, type: LoanEntryType, amount: number) {
  const absolute = Math.abs(amount);
  if (direction === "receivable") {
    return type === "principal" || type === "additional" ? -absolute : absolute;
  }
  return type === "principal" || type === "additional" ? absolute : -absolute;
}

function entryLabel(direction: LoanDirection, type: LoanEntryType) {
  if (type === "principal") return direction === "receivable" ? "借出" : "借入";
  if (type === "additional") return direction === "receivable" ? "追加借出" : "追加借入";
  if (type === "interest") return direction === "receivable" ? "利息收入" : "利息支出";
  return direction === "receivable" ? "收款" : "还款";
}

function requireLoan(id: string): LoanRow {
  const row = sqlite
    .prepare(
      `
      SELECT
        l.id,
        l.direction,
        COALESCE(l.loan_group_id, CASE l.direction WHEN 'receivable' THEN 'loan_group_receivable_default' ELSE 'loan_group_payable_default' END) AS loanGroupId,
        lg.name AS loanGroupName,
        lg.color AS loanGroupColor,
        lg.include_in_assets AS loanGroupIncludeInAssets,
        l.counterparty,
        l.principal_amount AS principalAmount,
        l.remaining_amount_cache AS remainingAmount,
        l.interest_amount_cache AS interestAmount,
        l.account_id AS accountId,
        a.name AS accountName,
        l.happened_on AS happenedOn,
        l.due_on AS dueOn,
        l.status,
        l.note,
        l.closed_at AS closedAt,
        l.created_at AS createdAt,
        l.updated_at AS updatedAt
      FROM loans l
      LEFT JOIN accounts a ON a.id = l.account_id
      LEFT JOIN loan_groups lg ON lg.id = COALESCE(l.loan_group_id, CASE l.direction WHEN 'receivable' THEN 'loan_group_receivable_default' ELSE 'loan_group_payable_default' END)
      WHERE l.id = ? AND l.deleted_at IS NULL
      LIMIT 1
    `
    )
    .get(id) as LoanRow | undefined;
  if (!row) throw notFound("借贷记录不存在");
  return row;
}

function readLoanEntries(loanId: string): LoanEntryRow[] {
  return sqlite
    .prepare(
      `
      SELECT
        e.id,
        e.type,
        e.amount,
        e.account_id AS accountId,
        a.name AS accountName,
        e.happened_on AS happenedOn,
        e.note,
        e.transaction_id AS transactionId,
        e.created_at AS createdAt
      FROM loan_entries e
      LEFT JOIN accounts a ON a.id = e.account_id
      WHERE e.loan_id = ?
      ORDER BY e.happened_on DESC, e.created_at DESC
    `
    )
    .all(loanId) as LoanEntryRow[];
}

function readPrincipalEntry(loanId: string): LoanEntryRow | undefined {
  return sqlite
    .prepare(
      `
      SELECT
        e.id,
        e.type,
        e.amount,
        e.account_id AS accountId,
        a.name AS accountName,
        e.happened_on AS happenedOn,
        e.note,
        e.transaction_id AS transactionId,
        e.created_at AS createdAt
      FROM loan_entries e
      LEFT JOIN accounts a ON a.id = e.account_id
      WHERE e.loan_id = ? AND e.type = 'principal'
      ORDER BY e.created_at ASC
      LIMIT 1
    `
    )
    .get(loanId) as LoanEntryRow | undefined;
}

function recalculateLoanFromEntries(loan: LoanRow) {
  const entries = readLoanEntries(loan.id);
  const principalEntries = entries.filter((entry) => entry.type === "principal");
  const principalBaseCents = principalEntries.length
    ? principalEntries.reduce((sum, entry) => sum + toCents(entry.amount), 0)
    : toCents(loan.principalAmount);
  const additionalCents = entries
    .filter((entry) => entry.type === "additional")
    .reduce((sum, entry) => sum + toCents(entry.amount), 0);
  const repaymentCents = entries
    .filter((entry) => entry.type === "repayment")
    .reduce((sum, entry) => sum + toCents(entry.amount), 0);
  const interestCents = entries
    .filter((entry) => entry.type === "interest")
    .reduce((sum, entry) => sum + toCents(entry.amount), 0);
  const principalCents = principalBaseCents + additionalCents;
  const remainingCents = Math.max(0, principalCents - repaymentCents);

  return { principalCents, remainingCents, interestCents };
}

function validateAccount(accountId?: string): string {
  if (!accountId) throw badRequest("请选择使用账户");
  const row = sqlite.prepare("SELECT id FROM accounts WHERE id = ? AND archived_at IS NULL AND hidden = 0 LIMIT 1").get(accountId) as
    | { id: string }
    | undefined;
  if (!row) throw badRequest("账户不存在");
  return row.id;
}

function insertLoanTransaction(options: {
  loan: Pick<LoanRow, "id" | "direction" | "counterparty">;
  entryType: LoanEntryType;
  amount: number;
  accountId: string;
  happenedOn: string;
  note?: string | null;
  created: string;
}) {
  const transactionId = createId("txn");
  const signedAmount = transactionSignedAmount(options.loan.direction, options.entryType, options.amount);
  const label = entryLabel(options.loan.direction, options.entryType);
  sqlite
    .prepare(
      `
      INSERT INTO transactions
        (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, loan_id, created_at, updated_at)
      VALUES
        (?, 'loan', ?, ?, ?, ?, NULL, 'default', NULL, ?, ?, ?, ?)
    `
    )
    .run(
      transactionId,
      options.happenedOn,
      signedAmount.toFixed(2),
      Math.abs(options.amount).toFixed(2),
      options.accountId,
      options.note ?? `${label} · ${options.loan.counterparty}`,
      options.loan.id,
      options.created,
      options.created
    );
  return transactionId;
}

function syncLinkedTransaction(options: {
  transactionId: string | null;
  loan: LoanRow;
  entryType: LoanEntryType;
  amount: number;
  accountId: string;
  happenedOn: string;
  note?: string | null;
  updated: string;
}) {
  if (!options.transactionId) return;
  const signedAmount = transactionSignedAmount(options.loan.direction, options.entryType, options.amount);
  sqlite
    .prepare(
      `
      UPDATE transactions
      SET happened_on = ?, amount = ?, display_amount = ?, account_id = ?, note = ?, updated_at = ?
      WHERE id = ? AND type = 'loan' AND loan_id = ? AND deleted_at IS NULL
    `
    )
    .run(
      options.happenedOn,
      signedAmount.toFixed(2),
      Math.abs(options.amount).toFixed(2),
      options.accountId,
      options.note ?? `${entryLabel(options.loan.direction, options.entryType)} · ${options.loan.counterparty}`,
      options.updated,
      options.transactionId,
      options.loan.id
    );
}

function applyLoanTotals(loanId: string, updated: string) {
  const loan = requireLoan(loanId);
  const totals = recalculateLoanFromEntries(loan);
  const nextStatus = totals.remainingCents === 0 ? "closed" : "open";
  sqlite
    .prepare(
      `
      UPDATE loans
      SET principal_amount = ?,
          remaining_amount_cache = ?,
          interest_amount_cache = ?,
          status = ?,
          closed_at = ?,
          updated_at = ?
      WHERE id = ?
    `
    )
    .run(
      fromCents(totals.principalCents),
      fromCents(totals.remainingCents),
      fromCents(totals.interestCents),
      nextStatus,
      nextStatus === "closed" ? updated : null,
      updated,
      loanId
    );
}

export const loansRoutes: FastifyPluginAsync = async (app) => {
  app.get("/groups", async (request) => {
    const query = groupListQuerySchema.parse(request.query ?? {});
    return ok(readLoanGroups(query.direction).map(serializeLoanGroup));
  });

  app.post("/groups", async (request) => {
    const body = groupPayloadSchema.parse(request.body ?? {});
    const now = new Date().toISOString();
    ensureLoanGroups(now);
    const id = createId("loan_group");
    const sortRow = sqlite
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS sortOrder FROM loan_groups WHERE direction = ? AND archived_at IS NULL")
      .get(body.direction) as { sortOrder: number };
    sqlite
      .prepare(
        `
        INSERT INTO loan_groups
          (id, name, direction, color, icon, include_in_assets, sort_order, is_default, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `
      )
      .run(id, body.name, body.direction, body.color, body.icon, body.includeInAssets ? 1 : 0, sortRow.sortOrder + 10, now, now);
    return ok(serializeLoanGroup(readLoanGroups(body.direction).find((group) => group.id === id) as LoanGroupRow));
  });

  app.put("/groups/:groupId", async (request) => {
    const { groupId } = groupParamsSchema.parse(request.params);
    const existing = sqlite
      .prepare("SELECT id, direction, is_default AS isDefault FROM loan_groups WHERE id = ? AND archived_at IS NULL LIMIT 1")
      .get(groupId) as { id: string; direction: LoanDirection; isDefault: 0 | 1 } | undefined;
    if (!existing) throw notFound("应收分组不存在");
    const body = groupUpdateSchema.parse(request.body ?? {});
    const nextDirection = body.direction ?? existing.direction;
    if (existing.isDefault && nextDirection !== existing.direction) {
      throw badRequest("默认分组不能改变类型");
    }
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `
        UPDATE loan_groups
        SET name = COALESCE(?, name),
            direction = ?,
            color = COALESCE(?, color),
            icon = COALESCE(?, icon),
            include_in_assets = COALESCE(?, include_in_assets),
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(
        body.name,
        nextDirection,
        body.color,
        body.icon,
        body.includeInAssets === undefined ? null : body.includeInAssets ? 1 : 0,
        now,
        existing.id
      );
    return ok(serializeLoanGroup(readLoanGroups(nextDirection).find((group) => group.id === existing.id) as LoanGroupRow));
  });

  app.get("/", async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where = ["l.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (query.status !== "all") {
      where.push("l.status = ?");
      params.push(query.status);
    }

    if (query.direction !== "all") {
      where.push("l.direction = ?");
      params.push(query.direction);
    }

    if (query.groupId && query.groupId !== "all") {
      where.push("COALESCE(l.loan_group_id, CASE l.direction WHEN 'receivable' THEN ? ELSE ? END) = ?");
      params.push(defaultReceivableGroupId, defaultPayableGroupId, query.groupId);
    }

    if (!query.includeHiddenGroups) {
      where.push("(l.direction <> 'receivable' OR COALESCE(lg.include_in_assets, 1) = 1)");
    }

    if (query.q) {
      where.push("(l.counterparty LIKE ? OR l.note LIKE ?)");
      params.push(`%${query.q}%`, `%${query.q}%`);
    }

    const rows = sqlite
      .prepare(
        `
        SELECT
          l.id,
          l.direction,
          COALESCE(l.loan_group_id, CASE l.direction WHEN 'receivable' THEN 'loan_group_receivable_default' ELSE 'loan_group_payable_default' END) AS loanGroupId,
          lg.name AS loanGroupName,
          lg.color AS loanGroupColor,
          lg.include_in_assets AS loanGroupIncludeInAssets,
          l.counterparty,
          l.principal_amount AS principalAmount,
          l.remaining_amount_cache AS remainingAmount,
          l.interest_amount_cache AS interestAmount,
          l.account_id AS accountId,
          a.name AS accountName,
          l.happened_on AS happenedOn,
          l.due_on AS dueOn,
          l.status,
          l.note,
          l.closed_at AS closedAt,
          l.created_at AS createdAt,
          l.updated_at AS updatedAt
        FROM loans l
        LEFT JOIN accounts a ON a.id = l.account_id
        LEFT JOIN loan_groups lg ON lg.id = COALESCE(l.loan_group_id, CASE l.direction WHEN 'receivable' THEN 'loan_group_receivable_default' ELSE 'loan_group_payable_default' END)
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE l.status WHEN 'open' THEN 0 ELSE 1 END,
          l.happened_on DESC,
          l.created_at DESC
        LIMIT ?
      `
      )
      .all(...params, query.limit) as LoanRow[];

    return ok(rows.map(serializeLoan));
  });

  app.get("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const loan = requireLoan(params.id);
    return ok({ ...serializeLoan(loan), entries: readLoanEntries(loan.id) });
  });

  app.post("/", async (request) => {
    const body = createLoanSchema.parse(request.body);
    const now = new Date().toISOString();
    const id = createId("loan");
    const principal = toMoney(body.principalAmount);
    const accountId = validateAccount(body.accountId);
    const loanGroupId = validateLoanGroup(body.direction, body.loanGroupId);

    sqlite.transaction(() => {
      sqlite
        .prepare(
          `
          INSERT INTO loans
            (id, direction, loan_group_id, counterparty, principal_amount, remaining_amount_cache, interest_amount_cache, account_id,
             happened_on, due_on, reminder_enabled, status, note, created_at, updated_at)
          VALUES
            (?, ?, ?, ?, ?, ?, '0.00', ?, ?, ?, 0, 'open', ?, ?, ?)
        `
        )
        .run(id, body.direction, loanGroupId, body.counterparty, principal, principal, accountId, body.happenedOn, body.dueOn ?? null, body.note ?? null, now, now);

      const loan = requireLoan(id);
      const transactionId = insertLoanTransaction({
        loan,
        entryType: "principal",
        amount: body.principalAmount,
        accountId,
        happenedOn: body.happenedOn,
        note: body.note ?? `${entryLabel(body.direction, "principal")} · ${body.counterparty}`,
        created: now
      });
      sqlite
        .prepare(
          `
          INSERT INTO loan_entries
            (id, loan_id, type, amount, account_id, happened_on, note, transaction_id, created_at, updated_at)
          VALUES
            (?, ?, 'principal', ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(createId("loan_entry"), id, principal, accountId, body.happenedOn, body.note ?? null, transactionId, now, now);
    })();

    return ok({ ...serializeLoan(requireLoan(id)), entries: readLoanEntries(id) });
  });

  app.put("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = requireLoan(params.id);
    const body = updateLoanSchema.parse(request.body);
    const now = new Date().toISOString();
    const nextPrincipal = body.principalAmount === undefined ? Number(existing.principalAmount) : body.principalAmount;
    const nextDirection = body.direction ?? existing.direction;
    const loanGroupId = body.loanGroupId === undefined
      ? body.direction && body.direction !== existing.direction
        ? defaultGroupId(nextDirection)
        : existing.loanGroupId ?? defaultGroupId(nextDirection)
      : validateLoanGroup(nextDirection, body.loanGroupId);
    const accountId = body.accountId === undefined ? existing.accountId : validateAccount(body.accountId);
    if (!accountId) throw badRequest("请选择使用账户");

    sqlite.transaction(() => {
      sqlite
        .prepare(
          `
          UPDATE loans
          SET direction = ?,
              loan_group_id = ?,
              counterparty = ?,
              account_id = ?,
              happened_on = ?,
              due_on = ?,
              note = ?,
              updated_at = ?
          WHERE id = ? AND deleted_at IS NULL
        `
        )
        .run(
          nextDirection,
          loanGroupId,
          body.counterparty ?? existing.counterparty,
          accountId,
          body.happenedOn ?? existing.happenedOn,
          body.dueOn === undefined ? existing.dueOn : body.dueOn ?? null,
          body.note === undefined ? existing.note : body.note ?? null,
          now,
          existing.id
        );

      const updatedLoan = requireLoan(existing.id);
      const principalEntry = readPrincipalEntry(existing.id);
      if (principalEntry) {
        sqlite
          .prepare(
            `
            UPDATE loan_entries
            SET amount = ?, account_id = ?, happened_on = ?, note = ?, updated_at = ?
            WHERE id = ?
          `
          )
          .run(toMoney(nextPrincipal), accountId, body.happenedOn ?? existing.happenedOn, body.note ?? principalEntry.note, now, principalEntry.id);
        syncLinkedTransaction({
          transactionId: principalEntry.transactionId,
          loan: updatedLoan,
          entryType: "principal",
          amount: nextPrincipal,
          accountId,
          happenedOn: body.happenedOn ?? existing.happenedOn,
          note: body.note ?? principalEntry.note,
          updated: now
        });
      } else {
        const transactionId = insertLoanTransaction({
          loan: updatedLoan,
          entryType: "principal",
          amount: nextPrincipal,
          accountId,
          happenedOn: body.happenedOn ?? existing.happenedOn,
          note: body.note ?? existing.note,
          created: now
        });
        sqlite
          .prepare(
            `
            INSERT INTO loan_entries
              (id, loan_id, type, amount, account_id, happened_on, note, transaction_id, created_at, updated_at)
            VALUES
              (?, ?, 'principal', ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(createId("loan_entry"), existing.id, toMoney(nextPrincipal), accountId, body.happenedOn ?? existing.happenedOn, body.note ?? existing.note, transactionId, now, now);
      }
      applyLoanTotals(existing.id, now);
    })();

    return ok({ ...serializeLoan(requireLoan(existing.id)), entries: readLoanEntries(existing.id) });
  });

  app.delete("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = requireLoan(params.id);
    const now = new Date().toISOString();
    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM loan_entries WHERE loan_id = ?").run(existing.id);
      sqlite.prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE loan_id = ? AND deleted_at IS NULL").run(now, now, existing.id);
      sqlite.prepare("UPDATE loans SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, existing.id);
    })();
    return ok({ id: existing.id, deleted: true });
  });

  app.post("/:id/entries", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const loan = requireLoan(params.id);
    const body = createEntrySchema.parse(request.body);
    const now = new Date().toISOString();
    const amount = toMoney(body.amount);
    const accountId = validateAccount(body.accountId);
    const entryId = createId("loan_entry");

    sqlite.transaction(() => {
      const transactionId = insertLoanTransaction({
        loan,
        entryType: body.type,
        amount: body.amount,
        accountId,
        happenedOn: body.happenedOn,
        note: body.note ?? `${entryLabel(loan.direction, body.type)} · ${loan.counterparty}`,
        created: now
      });
      sqlite
        .prepare(
          `
          INSERT INTO loan_entries
            (id, loan_id, type, amount, account_id, happened_on, note, transaction_id, created_at, updated_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(entryId, loan.id, body.type, amount, accountId, body.happenedOn, body.note ?? null, transactionId, now, now);
      applyLoanTotals(loan.id, now);
    })();

    const updated = requireLoan(loan.id);
    return ok({ ...serializeLoan(updated), entries: readLoanEntries(loan.id) });
  });

  app.delete("/:id/entries/:entryId", async (request) => {
    const params = z.object({ id: z.string(), entryId: z.string() }).parse(request.params);
    const loan = requireLoan(params.id);
    const existing = sqlite
      .prepare("SELECT id, type, transaction_id AS transactionId FROM loan_entries WHERE id = ? AND loan_id = ? LIMIT 1")
      .get(params.entryId, params.id) as { id: string; type: LoanEntryType; transactionId: string | null } | undefined;
    if (!existing) throw notFound("借贷流水不存在");
    if (existing.type === "principal") throw badRequest("初始借贷记录不能单独删除，请删除整笔借贷");
    const now = new Date().toISOString();

    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM loan_entries WHERE id = ?").run(params.entryId);
      if (existing.transactionId) {
        sqlite
          .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'loan' AND loan_id = ?")
          .run(now, now, existing.transactionId, loan.id);
      }
      applyLoanTotals(loan.id, now);
    })();

    return ok({ id: params.entryId, deleted: true, loan: serializeLoan(requireLoan(loan.id)) });
  });

  app.post("/:id/close", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const loan = requireLoan(params.id);
    if (toCents(loan.remainingAmount) > 0) {
      throw badRequest("仍有未结清金额，请先记录收款/还款后再结清");
    }
    const now = new Date().toISOString();
    sqlite
      .prepare("UPDATE loans SET status = 'closed', remaining_amount_cache = '0.00', closed_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, loan.id);
    return ok(serializeLoan(requireLoan(loan.id)));
  });

  app.post("/:id/reopen", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const loan = requireLoan(params.id);
    const now = new Date().toISOString();
    const totals = recalculateLoanFromEntries(loan);
    const nextStatus = totals.remainingCents === 0 ? "closed" : "open";
    sqlite
      .prepare(
        `
        UPDATE loans
        SET principal_amount = ?,
            remaining_amount_cache = ?,
            interest_amount_cache = ?,
            status = ?,
            closed_at = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(
        fromCents(totals.principalCents),
        fromCents(totals.remainingCents),
        fromCents(totals.interestCents),
        nextStatus,
        nextStatus === "closed" ? now : null,
        now,
        loan.id
      );
    return ok(serializeLoan(requireLoan(loan.id)));
  });
};
