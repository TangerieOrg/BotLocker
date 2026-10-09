import type { Client } from "discord.js";
import { getValveMatch } from "../deadlock/valve.ts";
import { getLinks, getMatchSalt, insertMetaMatches, saveMatchDetails, setMatchSalt } from "../db/mod.ts";
import { announceMatch } from "./tracker/mod.ts";
import { MAX_NOTIFY_AGE_S } from "../config.ts";

export interface Salt {
    match_id: number;
    cluster_id: number;
    metadata_salt: number;
}

const MAX_ATTEMPTS = 3;

let client : Client | undefined;
const queued = new Set<number>();
let pending : Salt[] = [];
let running = false;

// Server starts before the bot, matches ingested before then are stored but not announced
export const setIngestClient = (c : Client) => client = c;

async function ingest(x : Salt) {
    const prev = await getMatchSalt(x.match_id);
    if(prev?.status == "ok" || (prev && prev.attempts >= MAX_ATTEMPTS)) return;

    let meta;
    try {
        meta = await getValveMatch(x.match_id, x.cluster_id, x.metadata_salt);
    } catch(err) {
        console.error(`[Ingest] Failed to fetch match ${x.match_id}: ${(err as Error).message}`);
        await setMatchSalt(x.match_id, x.cluster_id, x.metadata_salt, "failed");
        return;
    }

    await saveMatchDetails(meta);
    const info = meta.match_info;

    const links = new Map((await getLinks()).map(l => [l.account_id, l]));
    const added = await insertMetaMatches(meta, [...links.keys()]);
    await setMatchSalt(x.match_id, x.cluster_id, x.metadata_salt, "ok");

    console.log(`[Ingest] Stored match ${x.match_id}${added.length > 0 ? `, ${added.length} new linked player(s)` : ""}`);

    if(added.length == 0 || !client) return;
    if(info.start_time + info.duration_s < Date.now() / 1000 - MAX_NOTIFY_AGE_S) {
        console.log(`[Ingest] Skipped match ${x.match_id}, too old to announce`);
        return;
    }

    for(const id of added) await announceMatch(client, links.get(id)!, x.match_id);
}

async function drain() {
    if(running) return;
    running = true;
    while(pending.length > 0) {
        const batch = pending.sort((a, b) => a.match_id - b.match_id);
        pending = [];
        for(const x of batch) {
            await ingest(x).catch(err => console.error(`[Ingest] Match ${x.match_id} failed`, err));
            queued.delete(x.match_id);
        }
    }
    running = false;
}

// Runs in the background, returns how many weren't already queued
export function queueSalts(salts : Salt[]) {
    const fresh = salts.filter(x => !queued.has(x.match_id) && queued.add(x.match_id));
    pending.push(...fresh);
    drain();
    return fresh.length;
}
