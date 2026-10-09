import protobuf from "protobufjs";
import { decompress } from "fzstd";
// @ts-types="./seek-bzip.d.ts"
import Bunzip from "seek-bzip";
import { SemaphoreQueue } from "@tangerie/utils/queue";
import type { MatchMetadata } from "./types.ts";

// Just the parts of CMsgMatchMetaData(Contents) we use, field numbers from the game's protos
const PROTO = `
syntax = "proto2";
message MetaData { optional uint32 version=1; optional bytes match_details=2; optional uint64 match_id=3; }
message Contents {
  message Players {
    optional uint32 account_id=1; optional uint32 player_slot=2; optional int32 team=6;
    optional uint32 kills=8; optional uint32 deaths=9; optional uint32 assists=10;
    optional uint32 net_worth=11; optional uint32 hero_id=12; optional uint32 last_hits=13;
    optional uint32 denies=14; optional uint32 level=18;
  }
  message MatchInfo {
    optional uint32 duration_s=1; optional int32 winning_team=3;
    repeated Players players=4; optional uint32 start_time=5; optional uint64 match_id=6;
    optional int32 game_mode=9; optional int32 match_mode=10;
    optional uint32 average_badge_team0=23; optional uint32 average_badge_team1=24;
  }
  optional MatchInfo match_info=2;
}
`;

const root = protobuf.parse(PROTO, { keepCase: true }).root;

const queue = new SemaphoreQueue(2);

function decode(name : string, buf : Uint8Array) {
    const type = root.lookupType(name);
    return type.toObject(type.decode(buf), { longs: Number, defaults: true });
}

export const metaUrl = (matchId : number, cluster : number, salt : number) =>
    `http://replay${cluster}.valve.net/1422450/${matchId}_${salt}.meta.bz2`;

export function parseMeta(raw : Uint8Array) : MatchMetadata {
    // Valve serves zstd now, despite the .bz2 name
    const outer = decode("MetaData", raw[0] === 0x28 ? decompress(raw) : new Uint8Array(Bunzip.decode(raw)));
    const x = decode("Contents", outer.match_details).match_info;

    return { match_info: {
        match_id: x.match_id,
        start_time: x.start_time,
        duration_s: x.duration_s,
        winning_team: x.winning_team,
        game_mode: x.game_mode,
        match_mode: x.match_mode,
        average_badge_team0: x.average_badge_team0 || null,
        average_badge_team1: x.average_badge_team1 || null,
        players: x.players.map((p : Record<string, number>) => ({
            account_id: p.account_id,
            player_slot: p.player_slot,
            team: p.team,
            hero_id: p.hero_id,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            net_worth: p.net_worth,
            last_hits: p.last_hits,
            denies: p.denies,
            level: p.level
        }))
    } };
}

export const getValveMatch = (matchId : number, cluster : number, salt : number) => queue.run(async () => {
    const res = await fetch(metaUrl(matchId, cluster, salt));
    if(!res.ok) {
        await res.body?.cancel();
        throw new Error(`Valve ${res.status} ${matchId}`);
    }

    const meta = parseMeta(new Uint8Array(await res.arrayBuffer()));
    if(meta.match_info.match_id != matchId) throw new Error(`Valve sent match ${meta.match_info.match_id} for ${matchId}`);
    return meta;
});
