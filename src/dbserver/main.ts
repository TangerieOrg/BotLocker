import { Application } from "@oak/oak";
import { createRemoteSQliteRouter } from "@tangerie/remote-sqlite/server";

const path = `${Deno.env.get("DATA_DIR") ?? "./data"}/botlocker.sqlite3`;
const port = Number(Deno.env.get("DB_PORT") ?? 8080);

const router = createRemoteSQliteRouter({ path, readonly: true });
const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log(`[DbServer] Serving ${path} read-only on :${port}`);
await app.listen({ port });
