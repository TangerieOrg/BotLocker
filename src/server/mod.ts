import { Application } from "@oak/oak";
import { PORT } from "../config.ts";
import { router } from "./router.ts";

export function startServer() {
    const app = new Application();

    app.use(async (ctx, next) => {
        try {
            await next();
        } catch(err) {
            console.error(`[Server] ${ctx.request.method} ${ctx.request.url.pathname} failed`, err);
            ctx.response.status = 500;
            ctx.response.body = { error: "Internal Server Error" };
        }
    });

    app.use(router.routes());
    app.use(router.allowedMethods());

    app.addEventListener("listen", ({ port }) => console.log(`Server listening on http://0.0.0.0:${port}`));

    // Resolves when the server closes, so don't await it
    app.listen({ port: PORT }).catch(err => console.error("[Server] stopped", err));
    return app;
}
