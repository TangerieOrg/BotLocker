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
message GetMatchMetaData { optional uint64 match_id = 1; optional uint32 metadata_salt = 3; optional uint32 target_account_id = 4; }
message GetMatchMetaDataResponse {
  optional int32 result = 1; optional uint32 replay_salt = 2; optional uint32 metadata_salt = 3;
  optional uint32 replay_valid_through = 4; optional uint32 replay_group_id = 5;
}
`;

const HISTORY_REQUEST = 9112;
const METADATA_REQUEST = 9167;

export const GcResult = {
    InternalError: 0,
    Success: 1,
    InvalidPermission: 2,
    TemporarilyDisabled: 3,
    TooBusy: 4,
    RateLimited: 5,
    InvalidMatch: 6,
    MatchInFlight: 7,
    Timeout: 8
} as const;

export class GcError extends Error {
    constructor(public result : number) {
        super(`Game coordinator history request failed (result ${result})`);
    }
}

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const Request = root.lookupType("GetMatchHistory");
const Response = root.lookupType("GetMatchHistoryResponse");
const MetaRequest = root.lookupType("GetMatchMetaData");
const MetaResponse = root.lookupType("GetMatchMetaDataResponse");

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

export interface MatchSaltResult {
    result: number;
    cluster_id: number | null;
    metadata_salt: number | null;
    replay_salt: number | null;
}

// Salts are limited far harder than history, the caller keeps its own budget and handles a non-success result.
// Shares the queue and spacing with history but not its rate limit pause
export const getGcMatchSalts = (matchId : number) => queue.run(async () : Promise<MatchSaltResult> => {
    await sleep(Math.max(0, lastAt + MIN_GAP_MS - Date.now()));
    lastAt = Date.now();

    const raw = await gcJob(METADATA_REQUEST, MetaRequest.encode(MetaRequest.create({ match_id: matchId })).finish());
    const out = MetaResponse.toObject(MetaResponse.decode(raw), { longs: Number });

    return {
        result: out.result ?? GcResult.InternalError,
        // deadlock-api calls the replay group the cluster
        cluster_id: out.replay_group_id ?? null,
        metadata_salt: out.metadata_salt ?? null,
        replay_salt: out.replay_salt ?? null
    };
});
