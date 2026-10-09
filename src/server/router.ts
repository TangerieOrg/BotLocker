import { Router } from "@oak/oak";

export const router = new Router();

router.get("/health", ctx => {
    ctx.response.body = { ok: true };
});
