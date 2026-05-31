import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sqlite } from "../../db/client.js";
import { badRequest, notFound, ok } from "../../utils/http.js";

type ReportType = "income" | "expense";

type SummaryRow = {
  income: number | null;
  expense: number | null;
};

type CategoryRow = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amount: number | null;
  count: number;
};

type CategorySummaryRow = {
  id: string;
  name: string;
  type: ReportType;
  icon: string;
  color: string;
  amount: number | null;
  count: number;
  firstDate: string | null;
  lastDate: string | null;
};

type TrendRow = {
  month: string;
  income: number | null;
  expense: number | null;
};

type CompareRow = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  month: string;
  amount: number | null;
  count: number;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const yearSchema = z.coerce.number().int().min(1970).max(2999);
const reportTypeSchema = z.enum(["income", "expense"]);

const rangeQuerySchema = z
  .object({
    type: reportTypeSchema.default("expense"),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .transform((query) => ({
    ...query,
    startDate: query.startDate ?? query.from,
    endDate: query.endDate ?? query.to
  }));

const trendQuerySchema = z.object({
  year: yearSchema.default(() => new Date().getFullYear())
});

const compareQuerySchema = z.object({
  year: yearSchema.default(() => new Date().getFullYear()),
  type: reportTypeSchema.default("expense")
});

function assertRange(startDate?: string, endDate?: string) {
  if (startDate && endDate && startDate > endDate) {
    throw badRequest("startDate cannot be after endDate");
  }
}

function amountExpr(type: ReportType) {
  return type === "expense" ? "ABS(CAST(t.amount AS REAL))" : "CAST(t.amount AS REAL)";
}

function yearBounds(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  };
}

function monthsOfYear(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/summary", async () => {
    const row = sqlite
      .prepare(
        `
        SELECT
          SUM(CASE WHEN type = 'income' THEN CAST(amount AS REAL) ELSE 0 END) AS income,
          SUM(CASE WHEN type = 'expense' THEN ABS(CAST(amount AS REAL)) ELSE 0 END) AS expense
        FROM transactions
        WHERE deleted_at IS NULL
          AND loan_id IS NULL
          AND type IN ('income', 'expense')
      `
      )
      .get() as SummaryRow;

    const income = row.income ?? 0;
    const expense = row.expense ?? 0;
    return ok({
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      balance: (income - expense).toFixed(2)
    });
  });

  app.get("/category", async (request) => {
    const query = rangeQuerySchema.parse(request.query);
    assertRange(query.startDate, query.endDate);

    const conditions = ["t.deleted_at IS NULL", "t.loan_id IS NULL", "t.type = ?"];
    const params: unknown[] = [query.type];
    if (query.startDate) {
      conditions.push("t.happened_on >= ?");
      params.push(query.startDate);
    }
    if (query.endDate) {
      conditions.push("t.happened_on <= ?");
      params.push(query.endDate);
    }

    const rows = sqlite
      .prepare(
        `
        SELECT
          c.id AS categoryId,
          c.name,
          c.icon,
          c.color,
          SUM(${amountExpr(query.type)}) AS amount,
          COUNT(t.id) AS count
        FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE ${conditions.join(" AND ")}
        GROUP BY c.id, c.name, c.icon, c.color
        ORDER BY amount DESC, c.sort_order ASC, c.name ASC
        LIMIT ?
      `
      )
      .all(...params, query.limit) as CategoryRow[];

    const total = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    return ok({
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
      total: total.toFixed(2),
      rows: rows.map((row) => {
        const amount = row.amount ?? 0;
        return {
          categoryId: row.categoryId,
          name: row.name,
          icon: row.icon,
          color: row.color,
          count: row.count,
          amount: amount.toFixed(2),
          percent: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0
        };
      })
    });
  });

  app.get("/category/:id/summary", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = rangeQuerySchema.parse(request.query);
    assertRange(query.startDate, query.endDate);

    const joinConditions = ["t.category_id = c.id", "t.deleted_at IS NULL", "t.loan_id IS NULL", "t.type = ?"];
    const joinParams: unknown[] = [query.type];
    if (query.startDate) {
      joinConditions.push("t.happened_on >= ?");
      joinParams.push(query.startDate);
    }
    if (query.endDate) {
      joinConditions.push("t.happened_on <= ?");
      joinParams.push(query.endDate);
    }

    const row = sqlite
      .prepare(
        `
        SELECT
          c.id,
          c.name,
          c.type,
          c.icon,
          c.color,
          SUM(${amountExpr(query.type)}) AS amount,
          COUNT(t.id) AS count,
          MIN(t.happened_on) AS firstDate,
          MAX(t.happened_on) AS lastDate
        FROM categories c
        LEFT JOIN transactions t ON ${joinConditions.join(" AND ")}
        WHERE c.id = ?
          AND c.hidden = 0
          AND c.archived_at IS NULL
        GROUP BY c.id, c.name, c.type, c.icon, c.color
        LIMIT 1
      `
      )
      .get(...joinParams, params.id) as CategorySummaryRow | undefined;

    if (!row) throw notFound("Category not found");
    const amount = row.amount ?? 0;
    return ok({
      category: {
        id: row.id,
        name: row.name,
        type: row.type,
        icon: row.icon,
        color: row.color
      },
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
      amount: amount.toFixed(2),
      count: row.count,
      average: row.count > 0 ? (amount / row.count).toFixed(2) : "0.00",
      firstDate: row.firstDate,
      lastDate: row.lastDate
    });
  });

  app.get("/trend", async (request) => {
    const { year } = trendQuerySchema.parse(request.query);
    const { startDate, endDate } = yearBounds(year);
    const rows = sqlite
      .prepare(
        `
        SELECT
          substr(happened_on, 1, 7) AS month,
          SUM(CASE WHEN type = 'income' THEN CAST(amount AS REAL) ELSE 0 END) AS income,
          SUM(CASE WHEN type = 'expense' THEN ABS(CAST(amount AS REAL)) ELSE 0 END) AS expense
        FROM transactions
        WHERE deleted_at IS NULL
          AND loan_id IS NULL
          AND type IN ('income', 'expense')
          AND happened_on >= ?
          AND happened_on <= ?
        GROUP BY month
        ORDER BY month ASC
      `
      )
      .all(startDate, endDate) as TrendRow[];

    const byMonth = new Map(rows.map((row) => [row.month, row]));
    const data = monthsOfYear(year).map((month) => {
      const row = byMonth.get(month);
      const income = row?.income ?? 0;
      const expense = row?.expense ?? 0;
      return {
        month,
        income: income.toFixed(2),
        expense: expense.toFixed(2),
        balance: (income - expense).toFixed(2)
      };
    });

    const totals = data.reduce(
      (summary, item) => ({
        income: summary.income + Number(item.income),
        expense: summary.expense + Number(item.expense),
        balance: summary.balance + Number(item.balance)
      }),
      { income: 0, expense: 0, balance: 0 }
    );

    return ok({
      year,
      rows: data,
      totals: {
        income: totals.income.toFixed(2),
        expense: totals.expense.toFixed(2),
        balance: totals.balance.toFixed(2)
      }
    });
  });

  app.get("/compare", async (request) => {
    const { year, type } = compareQuerySchema.parse(request.query);
    const { startDate, endDate } = yearBounds(year);
    const months = monthsOfYear(year);
    const rows = sqlite
      .prepare(
        `
        SELECT
          c.id AS categoryId,
          c.name,
          c.icon,
          c.color,
          substr(t.happened_on, 1, 7) AS month,
          SUM(${amountExpr(type)}) AS amount,
          COUNT(t.id) AS count
        FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE t.deleted_at IS NULL
          AND t.loan_id IS NULL
          AND t.type = ?
          AND t.happened_on >= ?
          AND t.happened_on <= ?
        GROUP BY c.id, c.name, c.icon, c.color, month
        ORDER BY c.sort_order ASC, c.name ASC, month ASC
      `
      )
      .all(type, startDate, endDate) as CompareRow[];

    const categories = new Map<
      string,
      {
        categoryId: string;
        name: string;
        icon: string;
        color: string;
        count: number;
        total: number;
        monthly: Map<string, { amount: number; count: number }>;
      }
    >();

    rows.forEach((row) => {
      const existing =
        categories.get(row.categoryId) ??
        {
          categoryId: row.categoryId,
          name: row.name,
          icon: row.icon,
          color: row.color,
          count: 0,
          total: 0,
          monthly: new Map<string, { amount: number; count: number }>()
        };
      const amount = row.amount ?? 0;
      existing.total += amount;
      existing.count += row.count;
      existing.monthly.set(row.month, { amount, count: row.count });
      categories.set(row.categoryId, existing);
    });

    const categoryRows = Array.from(categories.values())
      .sort((a, b) => b.total - a.total)
      .map((category) => ({
        categoryId: category.categoryId,
        name: category.name,
        icon: category.icon,
        color: category.color,
        count: category.count,
        total: category.total.toFixed(2),
        average: (category.total / 12).toFixed(2),
        months: months.map((month) => {
          const item = category.monthly.get(month);
          return {
            month,
            amount: (item?.amount ?? 0).toFixed(2),
            count: item?.count ?? 0,
            ratio: category.total > 0 ? Math.round(((item?.amount ?? 0) / category.total) * 1000) / 10 : 0
          };
        })
      }));

    return ok({
      year,
      type,
      months,
      categories: categoryRows
    });
  });

  app.get("/member", async () => ok([]));
};
