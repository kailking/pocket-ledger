import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { env } from "../../config/env.js";
import { ok } from "../../utils/http.js";
import { AUTH_COOKIE, SESSION_MAX_AGE_SECONDS, authenticate, changePassword, createSession, ensureAdminUser, getSessionUser, requireSessionUser } from "./session.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const cookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: "auto" as const,
  signed: true,
  maxAge: SESSION_MAX_AGE_SECONDS
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request, reply) => {
    const sessionUser = getSessionUser(request);
    const user = sessionUser ?? ensureAdminUser();
    const authenticated = Boolean(sessionUser);
    if (sessionUser) {
      reply.setCookie(AUTH_COOKIE, createSession(sessionUser), cookieOptions);
    }
    return ok({
      username: env.ADMIN_USERNAME,
      authenticated,
      mustChangePassword: authenticated ? Boolean(user.mustChangePassword) : false
    });
  });

  app.post("/login", async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const user = authenticate(payload.username, payload.password);
    reply.setCookie(AUTH_COOKIE, createSession(user), cookieOptions);
    return ok({
      username: user.username,
      authenticated: true,
      mustChangePassword: Boolean(user.mustChangePassword)
    });
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(AUTH_COOKIE, { path: "/" });
    return ok({
      authenticated: false
    });
  });

  app.post("/change-password", async (request, reply) => {
    const user = requireSessionUser(request);
    const payload = changePasswordSchema.parse(request.body);
    const updatedUser = changePassword(user, payload.currentPassword, payload.newPassword);
    reply.setCookie(AUTH_COOKIE, createSession(updatedUser), cookieOptions);
    return ok({
      changed: true,
      authenticated: true,
      mustChangePassword: false
    });
  });
};
