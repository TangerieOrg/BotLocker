import { SemaphoreQueue } from "@tangerie/utils/queue";
import { INGEST_CONCURRENCY, POLL_INTERVAL_MS } from "./config.ts";
import { countIngest, getDueIngest, INGEST_VERSION, type IngestRow, requeueOutdated, retryIngest, saveMeta, seedIngest } from "./db/ingest.ts";
import { now } from "./helpers/now.ts";
import { logger } from "./helpers/log.ts";
import { fetchMeta } from "./meta/fetch.ts";
import { getMetadataSalts } from "./source/botlocker.ts";

const { log, error } = logger("Ingest");

const BATCH = 50;
const IDLE_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_S = 10 * 60;
const RETRY_MAX_S = 24 * 60 * 60;

const sleep = (ms : number) => new Promise(res => setTimeout(res, ms));
const message = (err : unknown) => err instanceof Error ? err.message : String(err);
const backoff = (row : IngestRow) => now() + Math.min(RETRY_BASE_S * 2 ** row.attempts, RETRY_MAX_S);

const queue = new SemaphoreQueue(INGEST_CONCURRENCY);
let lastSeed = 0;

async function seed() {
    try {
        const added = await seedIngest(await getMetadataSalts());
        lastSeed = Date.now();
        if(added > 0) log(`Queued ${added} matches`, await countIngest());
    } catch(err) {
        // Both containers start together on a deploy, so the bot often isn't serving yet. Tried again on the next idle tick
        error("Couldn't read salts from the bot", message(err));
    }
}

async function ingest(row : IngestRow) {
    try {
        await saveMeta(row.match_id, await fetchMeta(row.match_id, row.cluster_id, row.metadata_salt));
    } catch(err) {
        error(`Match ${row.match_id} failed (attempt ${row.attempts + 1})`, message(err));
        await retryIngest(row.match_id, backoff(row), message(err), MAX_ATTEMPTS);
    }
}

export async function startIngest() {
    const outdated = await requeueOutdated();
    if(outdated > 0) log(`Re-ingesting ${outdated} matches stored before version ${INGEST_VERSION}`);
    log(`Pulling salts from the bot every ${POLL_INTERVAL_MS / 60000}m`, await countIngest());
    while(true) {
        if(Date.now() - lastSeed >= POLL_INTERVAL_MS) await seed();

        const rows = await getDueIngest(BATCH, now());
        if(rows.length == 0) {
            await sleep(IDLE_MS);
            continue;
        }

        const started = Date.now();
        await Promise.all(rows.map(row => queue.run(() => ingest(row))));
        log(`Ingested a batch of ${rows.length} in ${Math.round((Date.now() - started) / 1000)}s`, await countIngest());
    }
}
