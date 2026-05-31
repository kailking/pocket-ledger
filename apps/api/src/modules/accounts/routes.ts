import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sqlite } from "../../db/client.js";
import { badRequest, notFound, ok } from "../../utils/http.js";
import { createId } from "../../utils/id.js";

type AccountRow = {
  id: string;
  name: string;
  type: string;
  kind: "asset" | "liability";
  initialBalance: string;
  balance: number;
  color: string;
  icon: string;
  includeInAssets: 0 | 1;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccountStatementRow = {
  id: string;
  type: string;
  happenedOn: string;
  amount: string;
  displayAmount: string;
  accountId: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  memberName: string | null;
  note: string | null;
  transferId: string | null;
  loanId: string | null;
  createdAt: string;
};

const accountKindSchema = z.enum(["asset", "liability"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalTrimmed = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const accountPayloadSchema = z.object({
  name: z.string().trim().min(1, "请填写账户名称").max(40),
  type: z.string().trim().min(1).max(40).default("custom"),
  kind: accountKindSchema.default("asset"),
  initialBalance: z.coerce.number().finite().default(0),
  color: z.string().trim().min(1).max(40).default("#5B7CFA"),
  icon: z.string().trim().min(1).max(40).default("wallet"),
  includeInAssets: z.coerce.boolean().default(true)
});

const accountUpdateSchema = accountPayloadSchema.partial();

const includeInAssetsSchema = z.object({
  accountIds: z.array(z.string())
});

const reorderAccountsSchema = z.object({
  accountIds: z.array(z.string()).min(1)
});

const statementQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2999).default(() => new Date().getFullYear())
});

const listAccountsQuerySchema = z.object({
  includeVirtual: z.coerce.boolean().default(false)
});

const adjustBalanceSchema = z
  .object({
    targetBalance: z.coerce.number().finite().optional(),
    balance: z.coerce.number().finite().optional(),
    happenedOn: dateSchema.optional(),
    note: z.string().trim().max(120).optional()
  })
  .transform((payload) => ({
    targetBalance: payload.targetBalance ?? payload.balance,
    happenedOn: payload.happenedOn ?? new Date().toISOString().slice(0, 10),
    note: payload.note
  }));

function toMoney(value: number): string {
  return value.toFixed(2);
}

function readSetting<T>(key: string, fallback: T): T {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: unknown, updatedAt = new Date().toISOString()) {
  sqlite
    .prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `
    )
    .run(key, JSON.stringify(value), updatedAt);
}

function isReceivableAssetVisible() {
  return readSetting<boolean>("assets.receivable.visible", true);
}

function receivableSummaryAccount(now = new Date().toISOString()) {
  const visible = isReceivableAssetVisible();
  const row = sqlite
    .prepare(
      `
      SELECT COALESCE(SUM(CAST(remaining_amount_cache AS REAL)), 0) AS balance
      FROM loans
      WHERE deleted_at IS NULL
        AND direction = 'receivable'
        AND status = 'open'
    `
    )
    .get() as { balance: number | null };
  const balance = row.balance ?? 0;
  return {
    id: "virtual_receivable",
    name: "\u5e94\u6536\u8d26",
    type: "receivable_summary",
    kind: "asset" as const,
    initialBalance: "0.00",
    balance: balance.toFixed(2),
    color: "#46B98F",
    icon: "hand-coins",
    includeInAssets: visible,
    sortOrder: 9_000_000,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    virtual: true
  };
}

function monthBounds(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { startDate, endDate: end };
}

function dateLabel(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (date === today) return "今天";
  return `${Number(date.slice(8, 10))}日`;
}

function statementCategory(row: AccountStatementRow) {
  if (row.type === "transfer_in" || row.type === "transfer_out") {
    return { category: "转账", icon: "banknote-arrow-down", color: "#5CB5CE" };
  }
  if (row.type === "balance_adjustment") {
    return { category: "余额变更", icon: "wallet", color: "#8A9AB0" };
  }
  if (row.type === "loan") {
    return {
      category: Number(row.amount) < 0 ? "借贷支出" : "借贷收入",
      icon: "hand-coins",
      color: "#533afd"
    };
  }
  return {
    category: row.categoryName ?? "一般",
    icon: row.categoryIcon ?? "star",
    color: row.categoryColor ?? "#8FD8F7"
  };
}

function availableStatementYears(accountId: string, selectedYear: number) {
  const rows = sqlite
    .prepare(
      `
      SELECT DISTINCT substr(happened_on, 1, 4) AS year
      FROM transactions
      WHERE account_id = ?
        AND deleted_at IS NULL
      ORDER BY year DESC
    `
    )
    .all(accountId) as Array<{ year: string | null }>;
  const years = new Set<number>([selectedYear, new Date().getFullYear()]);
  rows.forEach((row) => {
    const year = Number(row.year);
    if (Number.isInteger(year)) years.add(year);
  });
  return Array.from(years).sort((a, b) => b - a);
}

function readAccount(id: string, options: { includeArchived?: boolean } = {}): AccountRow {
  const archivedCondition = options.includeArchived === false ? "AND a.archived_at IS NULL" : "";
  const row = sqlite
    .prepare(
      `
      SELECT
        a.id,
        a.name,
        a.type,
        a.kind,
        a.initial_balance AS initialBalance,
        CAST(a.initial_balance AS REAL) + COALESCE(SUM(CAST(t.amount AS REAL)), 0) AS balance,
        a.color,
        a.icon,
        a.include_in_assets AS includeInAssets,
        a.sort_order AS sortOrder,
        a.archived_at AS archivedAt,
        a.created_at AS createdAt,
        a.updated_at AS updatedAt
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL
      WHERE a.id = ? ${archivedCondition} AND a.hidden = 0
      GROUP BY a.id
      LIMIT 1
    `
    )
    .get(id) as AccountRow | undefined;
  if (!row) throw notFound("账户不存在");
  return row;
}

function readAccountForStatement(id: string): AccountRow {
  const row = sqlite
    .prepare(
      `
      SELECT
        a.id,
        a.name,
        a.type,
        a.kind,
        a.initial_balance AS initialBalance,
        CAST(a.initial_balance AS REAL) + COALESCE(SUM(CAST(t.amount AS REAL)), 0) AS balance,
        a.color,
        a.icon,
        a.include_in_assets AS includeInAssets,
        a.sort_order AS sortOrder,
        a.archived_at AS archivedAt,
        a.created_at AS createdAt,
        a.updated_at AS updatedAt
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL
      WHERE a.id = ? AND a.hidden = 0
      GROUP BY a.id
      LIMIT 1
    `
    )
    .get(id) as AccountRow | undefined;
  if (!row) throw notFound("账户不存在");
  return row;
}

function serializeAccount(row: AccountRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    kind: row.kind,
    initialBalance: Number(row.initialBalance).toFixed(2),
    balance: row.balance.toFixed(2),
    color: row.color,
    icon: row.icon,
    includeInAssets: Boolean(row.includeInAssets),
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function assertUniqueName(name: string, exceptId?: string) {
  const existing = sqlite
    .prepare(
      `
      SELECT id
      FROM accounts
      WHERE name = ? AND archived_at IS NULL AND hidden = 0
      LIMIT 1
    `
    )
    .get(name) as { id: string } | undefined;
  if (existing && existing.id !== exceptId) throw badRequest("账户名称已存在");
}

export const accountsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = listAccountsQuerySchema.parse(request.query ?? {});
    const rows = sqlite
      .prepare(
        `
        SELECT
          a.id,
          a.name,
          a.type,
          a.kind,
          a.initial_balance AS initialBalance,
          CAST(a.initial_balance AS REAL) + COALESCE(SUM(CAST(t.amount AS REAL)), 0) AS balance,
          a.color,
          a.icon,
          a.include_in_assets AS includeInAssets,
          a.sort_order AS sortOrder,
          a.archived_at AS archivedAt,
          a.created_at AS createdAt,
          a.updated_at AS updatedAt
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL
        WHERE a.archived_at IS NULL AND a.hidden = 0
        GROUP BY a.id
        ORDER BY a.sort_order ASC, a.kind, a.name
      `
      )
      .all() as AccountRow[];

    const serialized = rows.map(serializeAccount);
    const receivable = query.includeVirtual ? receivableSummaryAccount() : null;
    return ok(receivable ? [...serialized, receivable] : serialized);
  });

  app.get("/audit/duplicates", async () => {
    const rows = sqlite
      .prepare(
        `
        SELECT
          name,
          COUNT(*) AS count,
          GROUP_CONCAT(id, '|') AS ids,
          GROUP_CONCAT(initial_balance, '|') AS initialBalances,
          GROUP_CONCAT(current_balance_cache, '|') AS balanceCaches,
          MIN(created_at) AS firstCreatedAt,
          MAX(created_at) AS lastCreatedAt
        FROM accounts
        WHERE archived_at IS NULL AND hidden = 0
        GROUP BY name
        HAVING COUNT(*) > 1
        ORDER BY count DESC, name ASC
      `
      )
      .all() as Array<{
        name: string;
        count: number;
        ids: string;
        initialBalances: string;
        balanceCaches: string;
        firstCreatedAt: string;
        lastCreatedAt: string;
      }>;

    return ok(
      rows.map((row) => ({
        name: row.name,
        count: row.count,
        ids: row.ids.split("|"),
        initialBalances: row.initialBalances.split("|"),
        balanceCaches: row.balanceCaches.split("|"),
        firstCreatedAt: row.firstCreatedAt,
        lastCreatedAt: row.lastCreatedAt
      }))
    );
  });

  app.put("/reorder", async (request) => {
    const payload = reorderAccountsSchema.parse(request.body ?? {});
    const requestedIds = Array.from(new Set(payload.accountIds));
    const rows = sqlite
      .prepare(
        `
        SELECT id
        FROM accounts
        WHERE archived_at IS NULL AND hidden = 0
        ORDER BY sort_order ASC, kind, name
      `
      )
      .all() as Array<{ id: string }>;
    const validIds = new Set(rows.map((row) => row.id));
    const unknownId = requestedIds.find((id) => !validIds.has(id));
    if (unknownId) throw badRequest(`璐︽埛涓嶅瓨鍦細${unknownId}`);

    const orderedIds = [...requestedIds, ...rows.map((row) => row.id).filter((id) => !requestedIds.includes(id))];
    const updated = new Date().toISOString();
    const update = sqlite.prepare("UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?");
    sqlite.transaction(() => {
      orderedIds.forEach((id, index) => update.run((index + 1) * 10, updated, id));
    })();
    return ok({ accountIds: orderedIds });
  });

  app.get("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    return ok(serializeAccount(readAccount(params.id)));
  });

  app.get("/:id/statement", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = statementQuerySchema.parse(request.query);
    const account = readAccountForStatement(params.id);
    const year = query.year;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const openingDelta = sqlite
      .prepare(
        `
        SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS amount
        FROM transactions
        WHERE account_id = ?
          AND deleted_at IS NULL
          AND happened_on < ?
      `
      )
      .get(account.id, startDate) as { amount: number | null };

    const rows = sqlite
      .prepare(
        `
        SELECT
          t.id,
          t.type,
          t.happened_on AS happenedOn,
          t.amount,
          t.display_amount AS displayAmount,
          t.account_id AS accountId,
          t.category_id AS categoryId,
          c.name AS categoryName,
          c.icon AS categoryIcon,
          c.color AS categoryColor,
          m.name AS memberName,
          t.note,
          t.transfer_id AS transferId,
          t.loan_id AS loanId,
          t.created_at AS createdAt
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN members m ON m.id = t.member_id
        WHERE t.account_id = ?
          AND t.deleted_at IS NULL
          AND t.happened_on >= ?
          AND t.happened_on <= ?
        ORDER BY t.happened_on ASC, t.created_at ASC
      `
      )
      .all(account.id, startDate, endDate) as AccountStatementRow[];

    let runningBalance = Number(account.initialBalance) + (openingDelta.amount ?? 0);
    const serialized = rows.map((row) => {
      const delta = Number(row.amount);
      runningBalance += Number.isFinite(delta) ? delta : 0;
      const meta = statementCategory(row);
      const signedAmount = Number.isFinite(delta) ? delta : 0;
      return {
        id: row.id,
        type: row.type === "transfer_in" || row.type === "transfer_out" ? "transfer" : row.type,
        rawType: row.type,
        happenedOn: row.happenedOn,
        dateLabel: dateLabel(row.happenedOn),
        category: meta.category,
        categoryId: row.categoryId,
        note: row.note ?? "",
        amount: signedAmount.toFixed(2),
        displayAmount: row.displayAmount,
        signedAmount: signedAmount.toFixed(2),
        runningBalance: runningBalance.toFixed(2),
        account: account.name,
        accountId: account.id,
        member: row.memberName ?? undefined,
        icon: meta.icon,
        color: meta.color,
        transferId: row.transferId ?? undefined,
        loanId: row.loanId ?? undefined,
        createdAt: row.createdAt
      };
    });

    const byMonth = new Map<string, typeof serialized>();
    serialized.forEach((item) => {
      const month = item.happenedOn.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), item]);
    });

    let totalInflow = 0;
    let totalOutflow = 0;
    const months = Array.from({ length: 12 }, (_, index) => {
      const monthNumber = 12 - index;
      const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const transactions = (byMonth.get(month) ?? []).slice().reverse();
      const inflow = transactions.reduce((sum, item) => {
        const amount = Number(item.signedAmount);
        return amount > 0 ? sum + amount : sum;
      }, 0);
      const outflow = transactions.reduce((sum, item) => {
        const amount = Number(item.signedAmount);
        return amount < 0 ? sum + Math.abs(amount) : sum;
      }, 0);
      totalInflow += inflow;
      totalOutflow += outflow;
      const bounds = monthBounds(year, monthNumber);
      return {
        month,
        label: `${monthNumber}月`,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        inflow: inflow.toFixed(2),
        outflow: outflow.toFixed(2),
        net: (inflow - outflow).toFixed(2),
        count: transactions.length,
        transactions
      };
    });

    return ok({
      account: serializeAccount(account),
      year,
      availableYears: availableStatementYears(account.id, year),
      totals: {
        inflow: totalInflow.toFixed(2),
        outflow: totalOutflow.toFixed(2),
        net: (totalInflow - totalOutflow).toFixed(2)
      },
      months
    });
  });

  app.post("/:id/adjust-balance", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const payload = adjustBalanceSchema.parse(request.body ?? {});
    if (payload.targetBalance === undefined) throw badRequest("targetBalance is required");

    const account = readAccount(params.id, { includeArchived: false });
    const currentBalance = account.balance;
    const delta = payload.targetBalance - currentBalance;
    if (Math.abs(delta) < 0.005) throw badRequest("余额没有变化");

    const now = new Date().toISOString();
    const id = createId("txn");
    sqlite
      .prepare(
        `
        INSERT INTO transactions
          (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, created_at, updated_at)
        VALUES
          (?, 'balance_adjustment', ?, ?, ?, ?, NULL, 'default', NULL, ?, ?, ?)
      `
      )
      .run(
        id,
        payload.happenedOn,
        delta.toFixed(2),
        Math.abs(delta).toFixed(2),
        account.id,
        payload.note ?? (delta > 0 ? "余额调增" : "余额调减"),
        now,
        now
      );

    return ok({
      account: serializeAccount(readAccount(account.id)),
      transaction: {
        id,
        type: "balance_adjustment",
        happenedOn: payload.happenedOn,
        amount: delta.toFixed(2),
        displayAmount: Math.abs(delta).toFixed(2)
      }
    });
  });

  app.post("/", async (request) => {
    const payload = accountPayloadSchema.parse(request.body ?? {});
    assertUniqueName(payload.name);
    const now = new Date().toISOString();
    const id = createId("acct");
    const initialBalance = toMoney(payload.initialBalance);
    const orderRow = sqlite
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS sortOrder FROM accounts WHERE archived_at IS NULL AND hidden = 0")
      .get() as { sortOrder: number };

    sqlite
      .prepare(
        `
        INSERT INTO accounts
          (id, name, type, kind, initial_balance, current_balance_cache, color, icon, include_in_assets, sort_order, hidden, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `
      )
      .run(
        id,
        payload.name,
        payload.type,
        payload.kind,
        initialBalance,
        initialBalance,
        payload.color,
        payload.icon,
        payload.includeInAssets ? 1 : 0,
        orderRow.sortOrder + 10,
        now,
        now
      );

    return ok(serializeAccount(readAccount(id)));
  });

  app.put("/include-in-assets", async (request) => {
    const payload = includeInAssetsSchema.parse(request.body);
    const accountIds = Array.from(new Set(payload.accountIds));
    const receivableVisible = accountIds.includes("virtual_receivable");
    const realAccountIds = accountIds.filter((id) => id !== "virtual_receivable");
    const rows = sqlite
      .prepare("SELECT id FROM accounts WHERE archived_at IS NULL AND hidden = 0")
      .all() as Array<{ id: string }>;
    const validIds = new Set(rows.map((row) => row.id));
    const unknownId = realAccountIds.find((id) => !validIds.has(id));

    if (unknownId) {
      throw badRequest(`账户不存在：${unknownId}`);
    }

    const update = sqlite.prepare("UPDATE accounts SET include_in_assets = ?, updated_at = ? WHERE id = ?");
    const updated = new Date().toISOString();
    sqlite.transaction(() => {
      rows.forEach((row) => update.run(realAccountIds.includes(row.id) ? 1 : 0, updated, row.id));
      writeSetting("assets.receivable.visible", receivableVisible, updated);
    })();

    return ok({ accountIds: receivableVisible ? [...realAccountIds, "virtual_receivable"] : realAccountIds });
  });

  app.put("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = readAccount(params.id, { includeArchived: false });
    const payload = accountUpdateSchema.parse(request.body ?? {});
    const nextName = payload.name ?? existing.name;
    assertUniqueName(nextName, existing.id);
    const now = new Date().toISOString();
    const initialBalance =
      payload.initialBalance === undefined ? Number(existing.initialBalance) : payload.initialBalance;
    const initialBalanceText = toMoney(initialBalance);

    sqlite
      .prepare(
        `
        UPDATE accounts
        SET name = ?,
            type = ?,
            kind = ?,
            initial_balance = ?,
            current_balance_cache = ?,
            color = ?,
            icon = ?,
            include_in_assets = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(
        nextName,
        payload.type ?? existing.type,
        payload.kind ?? existing.kind,
        initialBalanceText,
        initialBalanceText,
        payload.color ?? existing.color,
        payload.icon ?? existing.icon,
        payload.includeInAssets === undefined ? existing.includeInAssets : payload.includeInAssets ? 1 : 0,
        now,
        existing.id
      );

    return ok(serializeAccount(readAccount(existing.id)));
  });

  app.delete("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = readAccount(params.id, { includeArchived: false });
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE accounts SET archived_at = ?, include_in_assets = 0, updated_at = ? WHERE id = ?").run(now, now, existing.id);
    return ok({ id: existing.id, deleted: true });
  });

  app.post("/:id/recalculate", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    return ok(serializeAccount(readAccount(params.id)));
  });
};
