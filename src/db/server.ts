import { Application } from "@oak/oak";
import { createRemoteSQliteRouter } from "@tangerie/remote-sqlite/server";
import { DATA_DIR, DB_PORT } from "../config.ts";
import { logger } from "../helpers/log.ts";

const { log, error } = logger("DbServer");

// Read-only, writes to prod still go through docker exec
export function startDbServer() {
    if(!DB_PORT) return;

    const path = `${DATA_DIR}/botlocker.sqlite3`;
    const router = createRemoteSQliteRouter({ path, readonly: true });
    const app = new Application();
    app.use(router.routes());
    app.use(router.allowedMethods());

    // A dead endpoint shouldn't take the bot down with it
    app.addEventListener("listen", () => log(`Serving ${path} read-only on :${DB_PORT}`));
    app.listen({ port: DB_PORT }).catch(e => error("Stopped", e));
}
