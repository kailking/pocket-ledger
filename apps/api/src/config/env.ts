import { z } from "zod";

const DEFAULT_SESSION_SECRET = "development-session-secret-change-me";
const DEFAULT_ADMIN_INITIAL_PASSWORD = "change-me-on-first-login";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("file:./data/app.db"),
  SESSION_SECRET: z.string().min(24).default(DEFAULT_SESSION_SECRET),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_INITIAL_PASSWORD: z.string().min(8).default(DEFAULT_ADMIN_INITIAL_PASSWORD),
  BACKUP_DIR: z.string().default("./data/backups"),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  ACCOUNT_BALANCE_SNAPSHOT_PATH: z.string().optional(),
  APP_TIME_ZONE: z.string().min(1).default("Asia/Shanghai"),
  WEB_DIST_DIR: z.string().default("./public")
});

const parsedEnv = envSchema.parse(process.env);

if (parsedEnv.APP_ENV === "production") {
  if (!process.env.SESSION_SECRET || parsedEnv.SESSION_SECRET === DEFAULT_SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set to a private random value when APP_ENV=production.");
  }
}

export const env = parsedEnv;

export type AppEnv = typeof env;
