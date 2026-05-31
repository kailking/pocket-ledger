import crypto from "node:crypto";

import type { FastifyRequest } from "fastify";

import { env } from "../../config/env.js";
import { sqlite } from "../../db/client.js";
import { badRequest, httpError } from "../../utils/http.js";

export const AUTH_COOKIE = "pocket_ledger_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type UserRow = {
  id: string;
  username: string;
  passwordHash: string;
  mustChangePassword: 0 | 1;
};

type SessionPayload = {
  username: string;
  passwordVersion: string;
  issuedAt: number;
};

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")): string {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function passwordVersion(passwordHash: string): string {
  return crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 24);
}

function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSession(value: string): SessionPayload | null {
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (!payload.username || !payload.passwordVersion || typeof payload.issuedAt !== "number") return null;
    return {
      username: payload.username,
      passwordVersion: payload.passwordVersion,
      issuedAt: payload.issuedAt
    };
  } catch {
    return null;
  }
}

export function ensureAdminUser(): UserRow {
  const existing = sqlite
    .prepare(
      `
      SELECT
        id,
        username,
        password_hash AS passwordHash,
        must_change_password AS mustChangePassword
      FROM users
      WHERE username = ?
    `
    )
    .get(env.ADMIN_USERNAME) as UserRow | undefined;

  if (existing) return existing;

  const created = new Date().toISOString();
  sqlite
    .prepare(
      `
      INSERT INTO users (id, username, password_hash, must_change_password, created_at, updated_at)
      VALUES ('admin', ?, ?, 1, ?, ?)
    `
    )
    .run(env.ADMIN_USERNAME, hashPassword(env.ADMIN_INITIAL_PASSWORD), created, created);

  return ensureAdminUser();
}

export function authenticate(username: string, password: string): UserRow {
  const user = ensureAdminUser();
  if (username !== user.username || !verifyPassword(password, user.passwordHash)) {
    throw httpError(401, "unauthorized", "用户名或密码不正确");
  }
  return user;
}

export function createSession(user: UserRow): string {
  return encodeSession({
    username: user.username,
    passwordVersion: passwordVersion(user.passwordHash),
    issuedAt: Date.now()
  });
}

export function getSessionUser(request: FastifyRequest): UserRow | null {
  const signed = request.cookies[AUTH_COOKIE];
  if (!signed) return null;

  const unsigned = request.unsignCookie(signed);
  if (!unsigned.valid || !unsigned.value) return null;

  const payload = decodeSession(unsigned.value);
  if (!payload) return null;

  const user = ensureAdminUser();
  if (payload.username !== user.username) return null;
  if (payload.passwordVersion !== passwordVersion(user.passwordHash)) return null;

  return user;
}

export function requireSessionUser(request: FastifyRequest): UserRow {
  const user = getSessionUser(request);
  if (!user) throw httpError(401, "unauthorized", "请先登录");
  return user;
}

export function changePassword(user: UserRow, currentPassword: string, newPassword: string): UserRow {
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw badRequest("当前密码不正确");
  }

  const updated = new Date().toISOString();
  sqlite
    .prepare(
      `
      UPDATE users
      SET password_hash = ?, must_change_password = 0, updated_at = ?
      WHERE id = ?
    `
    )
    .run(hashPassword(newPassword), updated, user.id);

  return ensureAdminUser();
}
