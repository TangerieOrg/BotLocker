import { getKv, hasMatches, insertMatches, setKv } from "../db/mod.ts";
import type { MatchHistoryEntry } from "../deadlock/types.ts";
import { logger } from "../helpers/log.ts";
import { getGcHistory, type HistoryPage } from "../steam/gc.ts";

// The GC gives 50 a page and ran out around 550 for a heavy player, this is just a safety net
const BACKFILL_PAGES = 50;
// Bump to make every account backfill again
const BACKFILL_VERSION = "2";

const { log } = logger("Tracker");

const backfilledKey = (accountId : number) => `backfilled:${accountId}`;

// Stores everything the GC still has without announcing any of it
async function backfill(accountId : number, firstPage : HistoryPage) {
    const started = Date.now();
    const all : MatchHistoryEntry[] = [];
    let page = firstPage;

    for(let i = 0; i < BACKFILL_PAGES; i++) {
        all.push(...page.matches);

        // Cursor walks back in time, stop if it ends or stops moving
        if(!page.cursor || page.matches.length == 0) break;
        const cursor = page.cursor;
        page = await getGcHistory(accountId, cursor);
        if(page.cursor == cursor) break;
    }

    const added = await insertMatches(all, true);
    await setKv(backfilledKey(accountId), BACKFILL_VERSION);
    log(`Backfilled ${added} match(es) for ${accountId} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

// Stores anything new in their history, returns how many matches are waiting to be announced
export async function syncHistory(accountId : number) {
    const page = await getGcHistory(accountId);

    // First look at this account, just store what's there instead of announcing it all.
    // A re-backfill still announces anything new so games finished meanwhile aren't swallowed
    if(await getKv(backfilledKey(accountId)) != BACKFILL_VERSION) {
        const added = await hasMatches(accountId) ? await insertMatches(page.matches, false) : 0;
        await backfill(accountId, page);
        return added;
    }

    const added = await insertMatches(page.matches, false);
    if(added > 0) log(`${added} new match(es) for ${accountId}`);
    return added;
}
