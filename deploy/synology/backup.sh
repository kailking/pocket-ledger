#!/bin/sh
set -eu

CONTAINER_NAME="${CONTAINER_NAME:-pocket-ledger}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found. Run this script on the NAS over SSH." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  echo "Container '$CONTAINER_NAME' is not running." >&2
  exit 1
fi

docker exec -i "$CONTAINER_NAME" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function sqlitePathFromUrl(value) {
  const raw = value || "file:/data/app.db";
  return raw.startsWith("file:") ? raw.slice("file:".length) : raw;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

(async () => {
  const dbPath = sqlitePathFromUrl(process.env.DATABASE_URL);
  const backupDir = process.env.BACKUP_DIR || "/data/backups";
  fs.mkdirSync(backupDir, { recursive: true });

  const target = path.join(backupDir, `app-${timestamp()}.db`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    await db.backup(target);
  } finally {
    db.close();
  }

  console.log(target);
})().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
NODE
