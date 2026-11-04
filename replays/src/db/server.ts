import { Application } from "@oak/oak";
import { createRemoteSQliteRouter } from "@tangerie/remote-sqlite/server";
import { DB_PORT } from "../config.ts";
import { logger } from "../helpers/log.ts";
import { DB_PATH } from "./connection.ts";

const { log, error } = logger("DbServer");

export function startDbServer() {
    if(!DB_PORT) return;

    const router = createRemoteSQliteRouter({ path: DB_PATH, readonly: true });
    const app = new Application();
    app.use(router.routes());
    app.use(router.allowedMethods());

    // A dead endpoint shouldn't take the ingester down with it
    app.addEventListener("listen", () => log(`Serving ${DB_PATH} read-only on :${DB_PORT}`));
    app.listen({ port: DB_PORT }).catch(e => error("Stopped", e));
}
