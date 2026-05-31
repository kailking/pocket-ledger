import fs from "node:fs";
import path from "node:path";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";

import { env } from "./config/env.js";
import { ensureDatabase } from "./db/bootstrap.js";
import { accountsRoutes } from "./modules/accounts/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { backupsRoutes, runScheduledBackupIfDue } from "./modules/backups/routes.js";
import { budgetsRoutes } from "./modules/budgets/routes.js";
import { categoriesRoutes } from "./modules/categories/routes.js";
import { importsRoutes } from "./modules/imports/routes.js";
import { loansRoutes } from "./modules/loans/routes.js";
import { reportsRoutes } from "./modules/reports/routes.js";
import { settingsRoutes } from "./modules/settings/routes.js";
import { transactionsRoutes } from "./modules/transactions/routes.js";
import { transfersRoutes } from "./modules/transfers/routes.js";
import { getSessionUser } from "./modules/auth/session.js";
import { ok } from "./utils/http.js";

function isZodValidationError(error: unknown): error is ZodError {
  return error instanceof ZodError ||
    (typeof error === "object" &&
      error !== null &&
      "issues" in error &&
      Array.isArray((error as { issues?: unknown }).issues));
}

export async function buildApp() {
  ensureDatabase();
  await runScheduledBackupIfDue();

  const app = Fastify({
    logger: env.APP_ENV === "development"
  });

  await app.register(cors, {
    origin: env.APP_ENV === "production" ? env.APP_URL : true,
    credentials: true
  });
  await app.register(cookie, {
    secret: env.SESSION_SECRET
  });
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    if (request.url.startsWith("/api/auth/")) return;

    const user = getSessionUser(request);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "unauthorized",
          message: "请先登录"
        }
      });
    }

    if (user.mustChangePassword) {
      return reply.status(403).send({
        error: {
          code: "password_change_required",
          message: "请先修改初始密码"
        }
      });
    }
  });

  const webDistDir = path.resolve(process.cwd(), env.WEB_DIST_DIR);
  if (env.APP_ENV === "production" && fs.existsSync(webDistDir)) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      prefix: "/"
    });
  }

  app.get("/health", async () =>
    ok({
      status: "ok",
      app: "pocket-ledger-api"
    })
  );

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(accountsRoutes, { prefix: "/api/accounts" });
  await app.register(backupsRoutes, { prefix: "/api/backups" });
  await app.register(budgetsRoutes, { prefix: "/api/budgets" });
  await app.register(categoriesRoutes, { prefix: "/api/categories" });
  await app.register(importsRoutes, { prefix: "/api/imports" });
  await app.register(loansRoutes, { prefix: "/api/loans" });
  await app.register(reportsRoutes, { prefix: "/api/reports" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(transactionsRoutes, { prefix: "/api/transactions" });
  await app.register(transfersRoutes, { prefix: "/api/transfers" });

  if (env.APP_ENV === "production" && fs.existsSync(path.join(webDistDir, "index.html"))) {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        void reply.status(404).send({
          error: {
            code: "not_found",
            message: "API route not found"
          }
        });
        return;
      }

      void reply.sendFile("index.html");
    });
  }

  app.setErrorHandler((error, request, reply) => {
    const err = error instanceof Error ? error : new Error("Unknown error");
    const maybeHttpError = typeof error === "object" && error !== null
      ? (error as { statusCode?: unknown; code?: unknown; details?: unknown })
      : {};
    const maybeStatus = maybeHttpError.statusCode;
    const isValidationError = isZodValidationError(error);
    const statusCode = isValidationError ? 400 : typeof maybeStatus === "number" ? maybeStatus : 500;
    request.log.error(err);
    const code = isValidationError
      ? "validation_error"
      : typeof maybeHttpError.code === "string"
        ? maybeHttpError.code
        : statusCode === 404
          ? "not_found"
          : statusCode === 409
            ? "conflict"
            : statusCode === 400
              ? "bad_request"
              : statusCode === 500
                ? "internal_error"
                : "request_error";
    const details = isValidationError ? (error as ZodError).issues : maybeHttpError.details;
    void reply.status(statusCode).send({
      error: {
        code,
        message: isValidationError ? "请求参数不正确" : err.message,
        details
      }
    });
  });

  return app;
}
