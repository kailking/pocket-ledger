import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { sqlite } from "../../db/client.js";
import { badRequest, notFound, ok } from "../../utils/http.js";
import { createId } from "../../utils/id.js";
import { localDateKey } from "../../utils/localDate.js";

type TransferRow = {
  id: string;
  happenedOn: string;
  amount: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  note: string | null;
  bookId: string | null;
  memberId: string | null;
  memberName: string | null;
  createdAt: string;
  updatedAt: string;
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const transferBodySchema = z.object({
  amount: z.coerce.number().finite().positive("金额必须大于 0"),
  fromAccountId: z.string().trim().min(1, "请选择转出账户"),
  toAccountId: z.string().trim().min(1, "请选择转入账户"),
  happenedOn: isoDateSchema.default(() => localDateKey()),
  note: optionalText,
  memberId: optionalText,
  bookId: optionalText
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

function requireAccount(id: string) {
  const row = sqlite.prepare("SELECT id FROM accounts WHERE id = ? AND archived_at IS NULL AND hidden = 0 LIMIT 1").get(id) as
    | { id: string }
    | undefined;
  if (!row) throw badRequest("账户不存在或已归档");
}

function validateMember(memberId?: string) {
  if (!memberId) return null;
  const row = sqlite.prepare("SELECT id FROM members WHERE id = ? LIMIT 1").get(memberId) as { id: string } | undefined;
  if (!row) throw badRequest("成员不存在");
  return memberId;
}

function requireTransfer(id: string): TransferRow {
  const row = sqlite
    .prepare(
      `
      SELECT
        tr.id,
        tr.happened_on AS happenedOn,
        tr.amount,
        tr.from_account_id AS fromAccountId,
        fa.name AS fromAccountName,
        tr.to_account_id AS toAccountId,
        ta.name AS toAccountName,
        tr.note,
        tr.book_id AS bookId,
        tx.member_id AS memberId,
        m.name AS memberName,
        tr.created_at AS createdAt,
        tr.updated_at AS updatedAt
      FROM transfers tr
      LEFT JOIN accounts fa ON fa.id = tr.from_account_id
      LEFT JOIN accounts ta ON ta.id = tr.to_account_id
      LEFT JOIN transactions tx ON tx.transfer_id = tr.id AND tx.type = 'transfer_out' AND tx.deleted_at IS NULL
      LEFT JOIN members m ON m.id = tx.member_id
      WHERE tr.id = ? AND tr.deleted_at IS NULL
      LIMIT 1
    `
    )
    .get(id) as TransferRow | undefined;
  if (!row) throw notFound("转账记录不存在");
  return row;
}

function toTransferResponse(row: TransferRow) {
  return {
    id: row.id,
    type: "transfer" as const,
    happenedOn: row.happenedOn,
    amount: row.amount,
    fromAccountId: row.fromAccountId,
    fromAccountName: row.fromAccountName,
    toAccountId: row.toAccountId,
    toAccountName: row.toAccountName,
    account: `${row.fromAccountName} -> ${row.toAccountName}`,
    note: row.note ?? "",
    bookId: row.bookId ?? "default",
    memberId: row.memberId ?? undefined,
    member: row.memberName ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function insertTransfer(body: z.infer<typeof transferBodySchema>) {
  if (body.fromAccountId === body.toAccountId) throw badRequest("转出和转入账户不能相同");
  requireAccount(body.fromAccountId);
  requireAccount(body.toAccountId);
  const memberId = validateMember(body.memberId);
  const now = new Date().toISOString();
  const transferId = createId("trf");
  const amount = body.amount.toFixed(2);
  const bookId = body.bookId ?? "default";
  const note = body.note ?? null;

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
      .run(transferId, body.happenedOn, amount, body.fromAccountId, body.toAccountId, note, bookId, now, now);

    sqlite
      .prepare(
        `
        INSERT INTO transactions
          (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, transfer_id, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        createId("txn"),
        "transfer_out",
        body.happenedOn,
        (-body.amount).toFixed(2),
        amount,
        body.fromAccountId,
        bookId,
        memberId,
        note,
        transferId,
        now,
        now
      );

    sqlite
      .prepare(
        `
        INSERT INTO transactions
          (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, transfer_id, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        createId("txn"),
        "transfer_in",
        body.happenedOn,
        amount,
        amount,
        body.toAccountId,
        bookId,
        memberId,
        note,
        transferId,
        now,
        now
      );
  })();

  return transferId;
}

export const transfersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = listQuerySchema.parse(request.query);
    const rows = sqlite
      .prepare(
        `
        SELECT
          tr.id,
          tr.happened_on AS happenedOn,
          tr.amount,
          tr.from_account_id AS fromAccountId,
          fa.name AS fromAccountName,
          tr.to_account_id AS toAccountId,
          ta.name AS toAccountName,
          tr.note,
          tr.book_id AS bookId,
          tx.member_id AS memberId,
          m.name AS memberName,
          tr.created_at AS createdAt,
          tr.updated_at AS updatedAt
        FROM transfers tr
        LEFT JOIN accounts fa ON fa.id = tr.from_account_id
        LEFT JOIN accounts ta ON ta.id = tr.to_account_id
        LEFT JOIN transactions tx ON tx.transfer_id = tr.id AND tx.type = 'transfer_out' AND tx.deleted_at IS NULL
        LEFT JOIN members m ON m.id = tx.member_id
        WHERE tr.deleted_at IS NULL
        ORDER BY tr.happened_on DESC, tr.created_at DESC
        LIMIT ?
      `
      )
      .all(query.limit) as TransferRow[];
    return ok(rows.map(toTransferResponse));
  });

  app.get("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    return ok(toTransferResponse(requireTransfer(params.id)));
  });

  app.post("/", async (request) => {
    const body = transferBodySchema.parse(request.body);
    const id = insertTransfer(body);
    return ok(toTransferResponse(requireTransfer(id)));
  });

  app.put("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = requireTransfer(params.id);
    const body = transferBodySchema.parse(request.body);
    if (body.fromAccountId === body.toAccountId) throw badRequest("转出和转入账户不能相同");
    requireAccount(body.fromAccountId);
    requireAccount(body.toAccountId);
    const memberId = validateMember(body.memberId);
    const now = new Date().toISOString();
    const amount = body.amount.toFixed(2);
    const bookId = body.bookId ?? existing.bookId ?? "default";
    const note = body.note ?? null;

    sqlite.transaction(() => {
      sqlite
        .prepare(
          `
          UPDATE transfers
          SET happened_on = ?, amount = ?, from_account_id = ?, to_account_id = ?, note = ?, book_id = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(body.happenedOn, amount, body.fromAccountId, body.toAccountId, note, bookId, now, existing.id);
      sqlite
        .prepare(
          `
          UPDATE transactions
          SET happened_on = ?, amount = ?, display_amount = ?, account_id = ?, book_id = ?, member_id = ?, note = ?, updated_at = ?
          WHERE transfer_id = ? AND type = 'transfer_out' AND deleted_at IS NULL
        `
        )
        .run(body.happenedOn, (-body.amount).toFixed(2), amount, body.fromAccountId, bookId, memberId, note, now, existing.id);
      sqlite
        .prepare(
          `
          UPDATE transactions
          SET happened_on = ?, amount = ?, display_amount = ?, account_id = ?, book_id = ?, member_id = ?, note = ?, updated_at = ?
          WHERE transfer_id = ? AND type = 'transfer_in' AND deleted_at IS NULL
        `
        )
        .run(body.happenedOn, amount, amount, body.toAccountId, bookId, memberId, note, now, existing.id);
    })();

    return ok(toTransferResponse(requireTransfer(existing.id)));
  });

  app.delete("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = requireTransfer(params.id);
    const now = new Date().toISOString();
    sqlite.transaction(() => {
      sqlite.prepare("UPDATE transfers SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, existing.id);
      sqlite
        .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE transfer_id = ? AND deleted_at IS NULL")
        .run(now, now, existing.id);
    })();
    return ok({ id: existing.id, type: "transfer", deleted: true });
  });
};
