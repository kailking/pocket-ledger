import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { env } from "../config/env.js";
import * as schema from "./schema.js";

export function resolveSqlitePath(databaseUrl: string): string {
  const withoutScheme = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;

  return path.isAbsolute(withoutScheme)
    ? withoutScheme
    : path.resolve(process.cwd(), withoutScheme);
}

const sqlitePath = resolveSqlitePath(env.DATABASE_URL);
export const sqliteFilePath = sqlitePath;

fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

export const sqlite = new Database(sqlitePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export type DatabaseClient = typeof db;
