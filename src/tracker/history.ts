import { getKv, insertMatches, setKv } from "../db/mod.ts";
import type { MatchHistoryEntry } from "../deadlock/types.ts";
import { logger } from "../helpers/log.ts";
import { getGcHistory, type HistoryPage } from "../steam/gc.ts";

const BACKFILL_DAYS = 91;
const BACKFILL_PAGES = 10;

const { log } = logger("Tracker");

const backfilledKey = (accountId : number) => `backfilled:${accountId}`;

// Stores roughly the last 3 months of history without announcing any of it
async function backfill(accountId : number, firstPage : HistoryPage) {
    const all : MatchHistoryEntry[] = [];
    const cutoff = Date.now() / 1000 - BACKFILL_DAYS * 24 * 60 * 60;
    let page = firstPage;

    for(let i = 0; i < BACKFILL_PAGES; i++) {
        all.push(...page.matches);

        // Cursor walks back in time, stop if it ends or stops moving
        if(!page.cursor || page.matches.length == 0 || page.matches.some(x => x.start_time < cutoff)) break;
        const cursor = page.cursor;
        page = await getGcHistory(accountId, cursor);
        if(page.cursor == cursor) break;
    }

    const added = await insertMatches(all, true);
    await setKv(backfilledKey(accountId), "1");
    log(`Backfilled ${added} match(es) for ${accountId}`);
}

// Stores anything new in their history, returns how many matches are waiting to be announced
export async function syncHistory(accountId : number) {
    const page = await getGcHistory(accountId);

    // First look at this account, just store what's there instead of announcing it all
    if(!await getKv(backfilledKey(accountId))) {
        await backfill(accountId, page);
        return 0;
    }

    const added = await insertMatches(page.matches, false);
    if(added > 0) log(`${added} new match(es) for ${accountId}`);
    return added;
}
