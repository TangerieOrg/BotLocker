import protobuf from "protobufjs";
import { SemaphoreQueue } from "@tangerie/utils/queue";
import { gcJob } from "./client.ts";
import { getKv, getLatestBadge, setKv } from "../db/mod.ts";
import type { MatchHistoryEntry } from "../deadlock/types.ts";

// Just what we use from citadel_gcmessages_client.proto (SteamDatabase/GameTracking-Deadlock), enums as plain ints
const PROTO = `
syntax = "proto2";
message GetMatchHistory { optional uint32 account_id = 1; optional uint64 continue_cursor = 2; }
message GetMatchHistoryResponse {
  message Match {
    optional uint64 match_id = 1; optional uint32 hero_id = 2; optional uint32 match_duration_s = 3;
    optional uint32 start_time = 4; optional uint32 match_result = 5; optional int32 player_team = 6;
    optional uint32 player_kills = 7; optional uint32 player_deaths = 8; optional uint32 player_assists = 9;
    optional uint32 last_hits = 11; optional uint32 denies = 12; optional uint32 hero_level = 13;
    optional uint32 net_worth = 14; optional int32 match_mode = 19; optional int32 game_mode = 20;
    optional int32 player_match_outcome = 26; optional uint32 ranked_display_badge = 27; optional int32 ranked_delta = 28;
  }
  optional int32 result = 1; optional uint64 continue_cursor = 2; repeated Match matches = 3;
}
message GetMatchMetaData { optional uint64 match_id = 1; }
message GetMatchMetaDataResponse {
  optional int32 result = 1; optional uint32 replay_salt = 2; optional uint32 metadata_salt = 3; optional uint32 replay_group_id = 5;
}
message GetProfileCard { optional uint32 account_id = 1; }
message ProfileCard { optional uint32 account_id = 1; optional uint32 ranked_badge_level = 3; }
`;

const MSG = {
    history: [9112, 9113],
    metadata: [9167, 9168],
    profile: [9024, 9025]
} as const;

type Kind = keyof typeof MSG;

export const GcResult = {
    Success: 1,
    InvalidPermission: 2,
    RateLimited: 5,
    InvalidMatch: 6,
    MatchInFlight: 7
} as const;

export class GcError extends Error {
    constructor(public kind : Kind, public result : number) {
        super(`Game coordinator ${kind} request failed (result ${result})`);
    }
}

const root = protobuf.parse(PROTO, { keepCase: true }).root;

// Valve doesn't publish the limits, these follow what deadlock-api-ingest uses
const MIN_GAP_MS = 2000;
const METADATA_GAP_MS = 20000;
const METADATA_DAILY_CAP = 40;
const PAUSE_MS : Record<Kind, number> = { history: 60 * 60 * 1000, profile: 60 * 60 * 1000, metadata: 24 * 60 * 60 * 1000 };
const METADATA_KEY = "gc_metadata_requests";
const DAY_MS = 24 * 60 * 60 * 1000;

const queue = new SemaphoreQueue(1);
const pausedUntil : Partial<Record<Kind, number>> = {};
let lastAt = 0;
let lastMetadataAt = 0;

const sleep = (ms : number) => new Promise(res => setTimeout(res, ms));

async function metadataUsed() {
    const times = JSON.parse(await getKv(METADATA_KEY) ?? "[]") as number[];
    return times.filter(x => x > Date.now() - DAY_MS);
}

export async function metadataRemaining() {
    return METADATA_DAILY_CAP - (await metadataUsed()).length;
}

function request(kind : Kind, req : string, res : string, body : Record<string, unknown>) {
    return queue.run(async () => {
        if((pausedUntil[kind] ?? 0) > Date.now()) throw new GcError(kind, GcResult.RateLimited);

        if(kind == "metadata") {
            const used = await metadataUsed();
            if(used.length >= METADATA_DAILY_CAP) throw new GcError(kind, GcResult.RateLimited);
            await sleep(Math.max(0, lastMetadataAt + METADATA_GAP_MS - Date.now()));
            await setKv(METADATA_KEY, JSON.stringify([...used, Date.now()]));
            lastMetadataAt = Date.now();
        }
        await sleep(Math.max(0, lastAt + MIN_GAP_MS - Date.now()));
        lastAt = Date.now();

        const reqType = root.lookupType(req);
        const resType = root.lookupType(res);
        const raw = await gcJob(MSG[kind][0], reqType.encode(reqType.create(body)).finish());
        const out = resType.toObject(resType.decode(raw), { longs: Number });

        // The profile card has no result field, an empty one means it failed
        const result = out.result ?? (kind == "profile" ? GcResult.Success : 0);
        if(result == GcResult.RateLimited) {
            pausedUntil[kind] = Date.now() + PAUSE_MS[kind];
            console.error(`[GC] Rate limited on ${kind}, pausing for ${PAUSE_MS[kind] / 60000}m`);
        }
        if(result != GcResult.Success) throw new GcError(kind, result);
        return out;
    });
}

export interface HistoryPage {
    matches: MatchHistoryEntry[];
    cursor?: number;
}

// Newest first, same shape deadlock-api's match-history endpoint used
export async function getGcHistory(accountId : number, cursor? : number) : Promise<HistoryPage> {
    const out = await request("history", "GetMatchHistory", "GetMatchHistoryResponse", { account_id: accountId, continue_cursor: cursor });
    const matches : MatchHistoryEntry[] = (out.matches ?? []).map((x : Record<string, number | undefined>) => ({
        account_id: accountId,
        match_id: x.match_id ?? 0,
        hero_id: x.hero_id ?? 0,
        hero_level: x.hero_level ?? 0,
        start_time: x.start_time ?? 0,
        game_mode: x.game_mode ?? 0,
        match_mode: x.match_mode ?? 0,
        player_team: x.player_team ?? 0,
        player_kills: x.player_kills ?? 0,
        player_deaths: x.player_deaths ?? 0,
        player_assists: x.player_assists ?? 0,
        denies: x.denies ?? 0,
        net_worth: x.net_worth ?? 0,
        last_hits: x.last_hits ?? 0,
        match_duration_s: x.match_duration_s ?? 0,
        match_result: x.match_result ?? 0,
        player_match_outcome: x.player_match_outcome ?? 0,
        ranked_display_badge: x.ranked_display_badge || null,
        ranked_delta: x.ranked_delta ?? null
    }));
    return { matches, cursor: out.continue_cursor as number | undefined };
}

export async function getGcSalts(matchId : number) {
    const out = await request("metadata", "GetMatchMetaData", "GetMatchMetaDataResponse", { match_id: matchId });
    return {
        match_id: matchId,
        cluster_id: out.replay_group_id as number,
        metadata_salt: out.metadata_salt as number,
        replay_salt: out.replay_salt as number | undefined
    };
}

export async function getGcRank(accountId : number) : Promise<number | undefined> {
    const out = await request("profile", "GetProfileCard", "ProfileCard", { account_id: accountId });
    return out.ranked_badge_level || undefined;
}

// The profile card only sometimes includes the rank, fall back to their latest ranked match
export async function getCurrentRank(accountId : number) {
    return await getGcRank(accountId).catch(() => undefined) ?? await getLatestBadge(accountId);
}
