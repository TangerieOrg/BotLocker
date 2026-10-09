import { Router } from "@oak/oak";
import { queueSalts, type Salt } from "../features/ingest.ts";
import { getMatchSalt } from "../db/mod.ts";

export const router = new Router();

const MAX_BATCH = 500;

const isId = (x : unknown) : x is number => Number.isSafeInteger(x) && (x as number) > 0;

router.get("/health", ctx => {
    ctx.response.body = { ok: true };
});

// Same shape as deadlock-api's /v1/matches/salts, replay salts are ignored since only the metadata is fetched
router.post("/ingest/salts", async ctx => {
    const body = await ctx.request.body.json().catch(() => undefined);
    if(!Array.isArray(body) || body.length > MAX_BATCH) {
        ctx.response.status = 400;
        ctx.response.body = { error: `Expected an array of at most ${MAX_BATCH} salts` };
        return;
    }

    const salts : Salt[] = body
        .filter(x => isId(x?.match_id) && isId(x?.cluster_id) && isId(x?.metadata_salt))
        .map(x => ({ match_id: x.match_id, cluster_id: x.cluster_id, metadata_salt: x.metadata_salt }));

    ctx.response.status = 202;
    ctx.response.body = { accepted: queueSalts(salts) };
});

router.get("/ingest/salts/:matchId", async ctx => {
    const salt = await getMatchSalt(Number(ctx.params.matchId));
    ctx.response.status = salt ? 200 : 404;
    ctx.response.body = salt ?? { error: "Not Found" };
});
