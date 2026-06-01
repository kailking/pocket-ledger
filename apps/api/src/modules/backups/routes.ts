import fs from "node:fs";
import path from "node:path";

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import Database from "better-sqlite3";
import { z } from "zod";

import { env } from "../../config/env.js";
import { sqlite, sqliteFilePath } from "../../db/client.js";
import { badRequest, notFound, ok } from "../../utils/http.js";

type BackupSummary = {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  downloadPath: string;
};

type BackupSchedule = {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const createBackupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional()
});

const backupScheduleSchema = z.object({
  enabled: z.coerce.boolean(),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily")
});

const clearAllSchema = z.object({
  confirmation: z.string(),
  secondConfirmation: z.coerce.boolean()
});

const backupFileNameSchema = z.object({
  fileName: z.string().regex(/^[a-zA-Z0-9._-]+\.db$/)
});

const restoreBackupSchema = z.object({
  fileName: z.string().regex(/^[a-zA-Z0-9._-]+\.db$/)
});

const restoreTables = [
  "users",
  "books",
  "members",
  "accounts",
  "categories",
  "transfers",
  "transactions",
  "loan_groups",
  "loans",
  "loan_entries",
  "budgets",
  "budget_categories",
  "import_batches",
  "import_warnings",
  "settings",
  "clear_logs"
];

const clearTables = [
  "budget_categories",
  "budgets",
  "loan_entries",
  "loans",
  "loan_groups",
  "transfers",
  "transactions",
  "import_warnings",
  "import_batches",
  "categories",
  "accounts",
  "members",
  "books"
];

function backupDir() {
  return path.resolve(process.cwd(), env.BACKUP_DIR);
}

function ensureBackupDir() {
  fs.mkdirSync(backupDir(), { recursive: true });
}

function sanitizeBackupPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function timestampPart(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function backupPath(fileName: string) {
  const parsed = backupFileNameSchema.parse({ fileName });
  const resolved = path.resolve(backupDir(), parsed.fileName);
  const relative = path.relative(backupDir(), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw badRequest("Invalid backup file name");
  }
  return resolved;
}

function toSummary(fileName: string, stat: fs.Stats): BackupSummary {
  return {
    id: fileName,
    fileName,
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    downloadPath: `/api/backups/${encodeURIComponent(fileName)}/export`
  };
}

function listBackups(): BackupSummary[] {
  ensureBackupDir();
  return fs
    .readdirSync(backupDir(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[a-zA-Z0-9._-]+\.db$/.test(entry.name))
    .map((entry) => {
      const filePath = backupPath(entry.name);
      return toSummary(entry.name, fs.statSync(filePath));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

function defaultSchedule(): BackupSchedule {
  return {
    enabled: false,
    frequency: "daily",
    lastRunAt: null,
    nextRunAt: null
  };
}

function nextRunAt(frequency: BackupSchedule["frequency"], from = new Date()) {
  const next = new Date(from.getTime());
  if (frequency === "daily") next.setDate(next.getDate() + 1);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

function readBackupSchedule(): BackupSchedule {
  const schedule = readSetting<BackupSchedule>("backups.schedule", defaultSchedule());
  return {
    enabled: Boolean(schedule.enabled),
    frequency: ["daily", "weekly", "monthly"].includes(schedule.frequency) ? schedule.frequency : "daily",
    lastRunAt: schedule.lastRunAt ?? null,
    nextRunAt: schedule.nextRunAt ?? null
  };
}

function saveBackupSchedule(input: { enabled: boolean; frequency: BackupSchedule["frequency"] }, now = new Date()) {
  const existing = readBackupSchedule();
  const schedule: BackupSchedule = {
    enabled: input.enabled,
    frequency: input.frequency,
    lastRunAt: existing.lastRunAt,
    nextRunAt: input.enabled ? nextRunAt(input.frequency, now) : null
  };
  writeSetting("backups.schedule", schedule, now.toISOString());
  return schedule;
}

export async function createBackup(name?: string) {
  ensureBackupDir();
  sqlite.pragma("wal_checkpoint(PASSIVE)");

  const safeName = name ? sanitizeBackupPart(name) || "backup" : "";
  const suffix = safeName ? `-${safeName}` : "";
  const fileName = `pocket-ledger-${timestampPart()}${suffix}.db`;
  const filePath = backupPath(fileName);
  await sqlite.backup(filePath);

  return toSummary(fileName, fs.statSync(filePath));
}

export async function runScheduledBackupIfDue(now = new Date()) {
  const schedule = readBackupSchedule();
  if (!schedule.enabled || !schedule.nextRunAt || schedule.nextRunAt > now.toISOString()) {
    return { ran: false, schedule };
  }

  const backup = await createBackup("scheduled");
  const nextSchedule: BackupSchedule = {
    enabled: true,
    frequency: schedule.frequency,
    lastRunAt: now.toISOString(),
    nextRunAt: nextRunAt(schedule.frequency, now)
  };
  writeSetting("backups.schedule", nextSchedule, now.toISOString());
  return { ran: true, backup, schedule: nextSchedule };
}

function sendBackup(reply: FastifyReply, filePath: string, fileName: string) {
  const stat = fs.statSync(filePath);
  return reply
    .header("Content-Type", "application/octet-stream")
    .header("Content-Disposition", `attachment; filename="${fileName}"`)
    .header("Content-Length", stat.size)
    .send(fs.createReadStream(filePath));
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row);
}

function tableColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

async function restoreBackup(fileName: string) {
  const sourcePath = backupPath(fileName);
  if (!fs.existsSync(sourcePath)) throw notFound("Backup not found");

  const safetyBackup = await createBackup("pre-restore");
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });

  try {
    sqlite.transaction(() => {
      sqlite.pragma("foreign_keys = OFF");
      [...restoreTables].reverse().forEach((tableName) => {
        if (tableExists(sqlite, tableName)) sqlite.prepare(`DELETE FROM ${tableName}`).run();
      });

      restoreTables.forEach((tableName) => {
        if (!tableExists(source, tableName) || !tableExists(sqlite, tableName)) return;

        const sourceColumns = tableColumns(source, tableName);
        const targetColumns = new Set(tableColumns(sqlite, tableName));
        const columns = sourceColumns.filter((column) => targetColumns.has(column));
        if (columns.length === 0) return;

        const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
        const placeholders = columns.map(() => "?").join(", ");
        const insert = sqlite.prepare(`INSERT INTO ${tableName} (${quotedColumns}) VALUES (${placeholders})`);
        const rows = source.prepare(`SELECT ${quotedColumns} FROM ${tableName}`).all() as Array<Record<string, unknown>>;
        rows.forEach((row) => insert.run(...columns.map((column) => row[column])));
      });
      sqlite.pragma("foreign_keys = ON");
    })();
  } finally {
    source.close();
  }

  sqlite.pragma("wal_checkpoint(TRUNCATE)");

  return {
    restoredFrom: fileName,
    safetyBackup: safetyBackup.fileName,
    databasePath: sqliteFilePath
  };
}

export const backupsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ok(listBackups()));

  app.get("/schedule", async () => ok(readBackupSchedule()));

  app.put("/schedule", async (request) => {
    const payload = backupScheduleSchema.parse(request.body ?? {});
    return ok(saveBackupSchedule(payload));
  });

  app.post("/run-scheduled", async () => ok(await runScheduledBackupIfDue()));

  app.post("/create", async (request, reply) => {
    const payload = createBackupSchema.parse(request.body ?? {});
    return reply.status(201).send(ok(await createBackup(payload.name)));
  });

  app.post("/clear-all", async (request) => {
    const payload = clearAllSchema.parse(request.body ?? {});
    if (payload.confirmation !== "\u6e05\u7a7a\u6240\u6709\u6570\u636e" || payload.secondConfirmation !== true) {
      throw badRequest("\u9700\u8981\u8f93\u5165\u786e\u8ba4\u6587\u5b57\u5e76\u5b8c\u6210\u4e8c\u6b21\u786e\u8ba4");
    }

    const safetyBackup = await createBackup("pre-clear");
    const clearedAt = new Date().toISOString();
    sqlite.transaction(() => {
      sqlite.pragma("foreign_keys = OFF");
      clearTables.forEach((tableName) => {
        if (tableExists(sqlite, tableName)) sqlite.prepare(`DELETE FROM ${tableName}`).run();
      });
      sqlite
        .prepare("INSERT INTO clear_logs (id, safety_backup, cleared_at, confirmation) VALUES (?, ?, ?, ?)")
        .run(`clear_${clearedAt.replace(/[^0-9]/g, "")}`, safetyBackup.fileName, clearedAt, payload.confirmation);
      sqlite.pragma("foreign_keys = ON");
    })();
    sqlite.pragma("wal_checkpoint(TRUNCATE)");

    return ok({
      safetyBackup: safetyBackup.fileName,
      clearedAt,
      clearedTables: clearTables
    });
  });

  app.post("/restore", async (request) => {
    const payload = restoreBackupSchema.parse(request.body ?? {});
    return ok(await restoreBackup(payload.fileName));
  });

  app.get("/export/full", async (_request, reply) => {
    const backup = await createBackup("export");
    return sendBackup(reply, backupPath(backup.fileName), backup.fileName);
  });

  app.get("/:fileName/export", async (request, reply) => {
    const { fileName } = backupFileNameSchema.parse(request.params);
    const filePath = backupPath(fileName);
    if (!fs.existsSync(filePath)) throw notFound("Backup not found");
    return sendBackup(reply, filePath, fileName);
  });
};
