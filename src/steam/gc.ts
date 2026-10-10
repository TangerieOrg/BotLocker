import protobuf from "protobufjs";
import { SemaphoreQueue } from "@tangerie/utils/queue";
import { gcJob } from "./client.ts";
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
    optional uint32 last_hits = 11; optional uint32 net_worth = 14; optional int32 match_mode = 19; optional int32 game_mode = 20;
    optional uint32 ranked_display_badge = 27; optional int32 ranked_delta = 28;
  }
  optional int32 result = 1; optional uint64 continue_cursor = 2; repeated Match matches = 3;
}
`;

const HISTORY_REQUEST = 9112;

export const GcResult = {
    Success: 1,
    InvalidPermission: 2,
    RateLimited: 5
} as const;

export class GcError extends Error {
    constructor(public result : number) {
        super(`Game coordinator history request failed (result ${result})`);
    }
}

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const Request = root.lookupType("GetMatchHistory");
const Response = root.lookupType("GetMatchHistoryResponse");

// Valve doesn't publish the limits, these follow what deadlock-api-ingest uses
const MIN_GAP_MS = 2000;
const PAUSE_MS = 60 * 60 * 1000;

// The game coordinator takes one request at a time anyway
const queue = new SemaphoreQueue(1);
let pausedUntil = 0;
let lastAt = 0;

const sleep = (ms : number) => new Promise(res => setTimeout(res, ms));

export interface HistoryPage {
    matches: MatchHistoryEntry[];
    cursor?: number;
}

// Newest first. Only works for accounts that are friends with the bot
export const getGcHistory = (accountId : number, cursor? : number) => queue.run(async () : Promise<HistoryPage> => {
    if(pausedUntil > Date.now()) throw new GcError(GcResult.RateLimited);

    await sleep(Math.max(0, lastAt + MIN_GAP_MS - Date.now()));
    lastAt = Date.now();

    const raw = await gcJob(HISTORY_REQUEST, Request.encode(Request.create({ account_id: accountId, continue_cursor: cursor })).finish());
    const out = Response.toObject(Response.decode(raw), { longs: Number });

    const result = out.result ?? 0;
    if(result == GcResult.RateLimited) {
        pausedUntil = Date.now() + PAUSE_MS;
        console.error(`[GC] Rate limited, pausing for ${PAUSE_MS / 60000}m`);
    }
    if(result != GcResult.Success) throw new GcError(result);

    const matches = (out.matches ?? []).map((x : Record<string, number | undefined>) : MatchHistoryEntry => ({
        account_id: accountId,
        match_id: x.match_id ?? 0,
        hero_id: x.hero_id ?? 0,
        start_time: x.start_time ?? 0,
        game_mode: x.game_mode ?? 0,
        match_mode: x.match_mode ?? 0,
        player_team: x.player_team ?? 0,
        player_kills: x.player_kills ?? 0,
        player_deaths: x.player_deaths ?? 0,
        player_assists: x.player_assists ?? 0,
        net_worth: x.net_worth ?? 0,
        last_hits: x.last_hits ?? 0,
        match_duration_s: x.match_duration_s ?? 0,
        match_result: x.match_result ?? 0,
        ranked_display_badge: x.ranked_display_badge || null,
        ranked_delta: x.ranked_delta ?? null
    }));
    return { matches, cursor: out.continue_cursor as number | undefined };
});
