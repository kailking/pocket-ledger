import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sqlite } from "../../db/client.js";
import { createId } from "../../utils/id.js";
import { badRequest, conflict, notFound, ok } from "../../utils/http.js";

type CategoryType = "income" | "expense";

type CategoryRow = {
  id: string;
  name: string;
  type: CategoryType;
  parentId: string | null;
  icon: string;
  color: string;
  sortOrder: number;
  isSystem: 0 | 1;
  hidden: 0 | 1;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const categoryTypeSchema = z.enum(["income", "expense"]);
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const emptyStringToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;
const optionalBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const querySchema = z.object({
  type: z.preprocess(emptyStringToUndefined, categoryTypeSchema.optional()),
  includeHidden: optionalBoolean
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: categoryTypeSchema,
  parentId: z.preprocess(emptyStringToNull, z.string().nullable().optional()),
  icon: z.string().trim().min(1).max(80).default("circle"),
  color: z.string().trim().min(1).max(32).default("#8FD8F7"),
  sortOrder: z.coerce.number().int().min(0).optional(),
  hidden: z.boolean().optional()
});

const updateCategorySchema = createCategorySchema.partial();

const paramsSchema = z.object({
  id: z.string().min(1)
});

const reorderItemSchema = z.object({
  id: z.string().min(1),
  sortOrder: z.coerce.number().int().min(0)
});

const reorderSchema = z.union([
  z.array(z.string().min(1)),
  z.object({
    ids: z.array(z.string().min(1)).optional(),
    categoryIds: z.array(z.string().min(1)).optional(),
    items: z.array(reorderItemSchema).optional()
  })
]);

function selectCategories(whereSql: string, params: unknown[] = []) {
  return sqlite
    .prepare(
      `
      SELECT
        id,
        name,
        type,
        parent_id AS parentId,
        icon,
        color,
        sort_order AS sortOrder,
        is_system AS isSystem,
        hidden,
        archived_at AS archivedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM categories
      ${whereSql}
    `
    )
    .all(...params) as CategoryRow[];
}

function toCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    isSystem: Boolean(row.isSystem),
    hidden: Boolean(row.hidden),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function getCategory(id: string) {
  return selectCategories("WHERE id = ?", [id])[0];
}

function getActiveCategory(id: string) {
  return selectCategories("WHERE id = ? AND archived_at IS NULL", [id])[0];
}

function assertNoActiveDuplicate(name: string, type: CategoryType, excludingId?: string) {
  const row = sqlite
    .prepare(
      `
      SELECT id
      FROM categories
      WHERE name = ?
        AND type = ?
        AND hidden = 0
        AND archived_at IS NULL
        ${excludingId ? "AND id <> ?" : ""}
      LIMIT 1
    `
    )
    .get(...(excludingId ? [name, type, excludingId] : [name, type])) as { id: string } | undefined;

  if (row) throw conflict("Category name already exists for this type");
}

function assertParent(parentId: string | null | undefined, type: CategoryType, selfId?: string) {
  if (!parentId) return null;
  if (parentId === selfId) throw badRequest("Category cannot be its own parent");

  const parent = getActiveCategory(parentId);
  if (!parent || parent.hidden) throw badRequest("Parent category does not exist");
  if (parent.type !== type) throw badRequest("Parent category type must match child category type");
  return parent.id;
}

function nextSortOrder(type: CategoryType) {
  const row = sqlite
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS sortOrder FROM categories WHERE type = ?")
    .get(type) as { sortOrder: number };
  return row.sortOrder;
}

function usedTransactionCount(categoryId: string) {
  const row = sqlite
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE category_id = ? AND deleted_at IS NULL")
    .get(categoryId) as { count: number };
  return row.count;
}

function parseReorderItems(body: unknown) {
  const payload = reorderSchema.parse(body);
  if (Array.isArray(payload)) {
    return payload.map((id, index) => ({ id, sortOrder: index + 1 }));
  }

  if (payload.items) return payload.items;

  const ids = payload.ids ?? payload.categoryIds;
  if (ids) return ids.map((id, index) => ({ id, sortOrder: index + 1 }));

  throw badRequest("Reorder payload must include ids or items");
}

export const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = querySchema.parse(request.query);
    const conditions = query.includeHidden ? ["archived_at IS NULL"] : ["hidden = 0", "archived_at IS NULL"];
    const params: unknown[] = [];

    if (query.type) {
      conditions.push("type = ?");
      params.push(query.type);
    }

    const rows = selectCategories(`WHERE ${conditions.join(" AND ")} ORDER BY type, sort_order, name`, params);
    return ok(rows.map(toCategory));
  });

  app.post("/", async (request, reply) => {
    const payload = createCategorySchema.parse(request.body);
    const parentId = assertParent(payload.parentId, payload.type);
    assertNoActiveDuplicate(payload.name, payload.type);

    const created = new Date().toISOString();
    const id = createId("cat");
    sqlite
      .prepare(
        `
        INSERT INTO categories
          (id, name, type, parent_id, icon, color, sort_order, is_system, hidden, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `
      )
      .run(
        id,
        payload.name,
        payload.type,
        parentId,
        payload.icon,
        payload.color,
        payload.sortOrder ?? nextSortOrder(payload.type),
        payload.hidden ? 1 : 0,
        created,
        created
      );

    const row = getCategory(id);
    if (!row) throw notFound("Category not found");
    return reply.status(201).send(ok(toCategory(row)));
  });

  app.put("/reorder", async (request) => {
    const items = parseReorderItems(request.body);
    const ids = [...new Set(items.map((item) => item.id))];
    const existingRows = ids.length
      ? selectCategories(`WHERE id IN (${ids.map(() => "?").join(", ")}) AND archived_at IS NULL`, ids)
      : [];
    const existingIds = new Set(existingRows.map((row) => row.id));
    const missingId = ids.find((id) => !existingIds.has(id));
    if (missingId) throw notFound(`Category not found: ${missingId}`);

    const updated = new Date().toISOString();
    const update = sqlite.prepare("UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?");
    sqlite.transaction(() => {
      items.forEach((item) => update.run(item.sortOrder, updated, item.id));
    })();

    return ok(
      selectCategories("WHERE archived_at IS NULL ORDER BY type, sort_order, name").map(toCategory)
    );
  });

  app.put("/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const row = getActiveCategory(id);
    if (!row) throw notFound("Category not found");

    const payload = updateCategorySchema.parse(request.body);
    const nextType = payload.type ?? row.type;
    if (payload.type && payload.type !== row.type && usedTransactionCount(row.id) > 0) {
      throw badRequest("Category type cannot be changed while transactions use it");
    }

    const nextName = payload.name ?? row.name;
    assertNoActiveDuplicate(nextName, nextType, row.id);
    const parentId = payload.parentId !== undefined
      ? assertParent(payload.parentId, nextType, row.id)
      : row.parentId;
    const updated = new Date().toISOString();

    sqlite
      .prepare(
        `
        UPDATE categories
        SET name = ?, type = ?, parent_id = ?, icon = ?, color = ?, sort_order = ?, hidden = ?, updated_at = ?
        WHERE id = ? AND archived_at IS NULL
      `
      )
      .run(
        nextName,
        nextType,
        parentId,
        payload.icon ?? row.icon,
        payload.color ?? row.color,
        payload.sortOrder ?? row.sortOrder,
        (payload.hidden ?? Boolean(row.hidden)) ? 1 : 0,
        updated,
        row.id
      );

    const updatedRow = getCategory(row.id);
    if (!updatedRow) throw notFound("Category not found");
    return ok(toCategory(updatedRow));
  });

  app.delete("/:id", async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const row = getActiveCategory(id);
    if (!row) throw notFound("Category not found");
    if (row.id === "transfer") throw badRequest("Transfer category cannot be deleted");

    const updated = new Date().toISOString();
    sqlite
      .prepare("UPDATE categories SET hidden = 1, archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL")
      .run(updated, updated, row.id);

    return ok({
      id: row.id,
      deleted: true,
      affectedTransactions: usedTransactionCount(row.id)
    });
  });
};
