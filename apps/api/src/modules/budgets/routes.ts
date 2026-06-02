import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sqlite } from "../../db/client.js";
import { badRequest, ok } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { localMonthKey, nextLocalMonthStart } from "../../utils/localDate.js";

type BudgetRow = {
  id: string;
  month: string;
  totalAmount: string;
  enabled: 0 | 1;
  displayMode: "remaining" | "used";
  createdAt: string;
  updatedAt: string;
};

type ExpenseRow = {
  expense: number | null;
};

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "月份格式应为 YYYY-MM");
const budgetPayloadSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  totalAmount: z.coerce.number().finite().min(0, "预算不能小于 0"),
  displayMode: z.enum(["remaining", "used"]).default("remaining")
});

function currentMonth() {
  return localMonthKey();
}

function assertMonth(month: string) {
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) throw badRequest("月份格式应为 YYYY-MM");
  return parsed.data;
}

function monthExpense(month: string) {
  const row = sqlite
    .prepare(
      `
      SELECT SUM(ABS(CAST(amount AS REAL))) AS expense
      FROM transactions
      WHERE deleted_at IS NULL
        AND type = 'expense'
        AND loan_id IS NULL
        AND happened_on >= ?
        AND happened_on < ?
    `
    )
    .get(`${month}-01`, nextMonth(month)) as ExpenseRow;
  return row.expense ?? 0;
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) throw badRequest("月份格式应为 YYYY-MM");
  return nextLocalMonthStart(month);
}

function readBudget(month: string): BudgetRow {
  const row = sqlite
    .prepare(
      `
      SELECT
        id,
        month,
        total_amount AS totalAmount,
        enabled,
        display_mode AS displayMode,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM budgets
      WHERE month = ?
      LIMIT 1
    `
    )
    .get(month) as BudgetRow | undefined;

  if (row) return row;
  const now = new Date().toISOString();
  const id = createId("budget");
  sqlite
    .prepare(
      `
      INSERT INTO budgets (id, month, total_amount, enabled, display_mode, created_at, updated_at)
      VALUES (?, ?, '23300.00', 1, 'remaining', ?, ?)
    `
    )
    .run(id, month, now, now);
  return readBudget(month);
}

function serializeBudget(row: BudgetRow) {
  const expense = monthExpense(row.month);
  const total = Number(row.totalAmount);
  return {
    id: row.id,
    month: row.month,
    enabled: Boolean(row.enabled),
    totalAmount: total.toFixed(2),
    usedAmount: expense.toFixed(2),
    remainingAmount: Math.max(0, total - expense).toFixed(2),
    displayMode: row.displayMode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export const budgetsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/current", async (request) => {
    const query = z.object({ month: monthSchema.optional() }).parse(request.query);
    return ok(serializeBudget(readBudget(query.month ?? currentMonth())));
  });

  app.get("/:month", async (request) => {
    const params = z.object({ month: z.string() }).parse(request.params);
    return ok(serializeBudget(readBudget(assertMonth(params.month))));
  });

  app.put("/:month", async (request) => {
    const params = z.object({ month: z.string() }).parse(request.params);
    const month = assertMonth(params.month);
    const body = budgetPayloadSchema.parse(request.body);
    const now = new Date().toISOString();
    const existing = readBudget(month);
    sqlite
      .prepare(
        `
        UPDATE budgets
        SET total_amount = ?, enabled = ?, display_mode = ?, updated_at = ?
        WHERE id = ?
      `
      )
      .run(body.totalAmount.toFixed(2), body.enabled ? 1 : 0, body.displayMode, now, existing.id);
    return ok(serializeBudget(readBudget(month)));
  });

  app.put("/:month/categories", async () => ok({ updated: 0 }));
};
