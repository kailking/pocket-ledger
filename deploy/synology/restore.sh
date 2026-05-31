#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: DATA_DIR=/volume1/docker/pocket-ledger/data $0 /path/to/app-backup.db" >&2
  exit 1
fi

BACKUP_FILE="$1"
DATA_DIR="${DATA_DIR:-/volume1/docker/pocket-ledger/data}"
CONTAINER_NAME="${CONTAINER_NAME:-pocket-ledger}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found. Run this script on the NAS over SSH." >&2
  exit 1
fi

mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/backups"

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  docker stop "$CONTAINER_NAME" >/dev/null
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SAFETY_DIR="$DATA_DIR/backups/pre-restore-$STAMP"
if [ -f "$DATA_DIR/app.db" ]; then
  mkdir -p "$SAFETY_DIR"
  cp "$DATA_DIR/app.db" "$SAFETY_DIR/app.db"
  if [ -f "$DATA_DIR/app.db-wal" ]; then
    cp "$DATA_DIR/app.db-wal" "$SAFETY_DIR/app.db-wal"
  fi
  if [ -f "$DATA_DIR/app.db-shm" ]; then
    cp "$DATA_DIR/app.db-shm" "$SAFETY_DIR/app.db-shm"
  fi
fi

cp "$BACKUP_FILE" "$DATA_DIR/app.db"
rm -f "$DATA_DIR/app.db-wal" "$DATA_DIR/app.db-shm"

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  docker start "$CONTAINER_NAME" >/dev/null
fi

echo "Restored $BACKUP_FILE to $DATA_DIR/app.db"
if [ -d "${SAFETY_DIR:-}" ]; then
  echo "Previous database snapshot saved to $SAFETY_DIR"
fi
