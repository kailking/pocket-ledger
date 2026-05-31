import type { FastifyPluginAsync } from "fastify";

import { ok } from "../../utils/http.js";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () =>
    ok({
      appName: "Pocket Ledger",
      defaultBook: "默认账本",
      currency: "CNY"
    })
  );
};

