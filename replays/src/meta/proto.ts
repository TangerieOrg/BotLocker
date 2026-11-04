import protobuf from "protobufjs";

// Just what we use from citadel_gcmessages_common.proto (SteamDatabase/Protobufs), enums as plain ints
const PROTO = `
syntax = "proto2";
message CMsgMatchMetaData { optional uint32 version = 1; optional bytes match_details = 2; optional uint64 match_id = 3; }
message Position { optional float x = 1; optional float y = 2; optional float z = 3; }
message Death {
  optional uint32 game_time_s = 1; optional float time_to_kill_s = 2; optional uint32 killer_player_slot = 9;
  optional Position death_pos = 10; optional Position killer_pos = 11; optional uint32 death_duration_s = 12;
}
message Stats {
  optional uint32 time_stamp_s = 1; optional uint32 net_worth = 2; optional uint32 gold_player = 3; optional uint32 gold_boss = 7;
  optional uint32 gold_treasure = 9; optional uint32 gold_denied = 10; optional uint32 gold_death_loss = 11;
  optional uint32 gold_lane_creep = 12; optional uint32 gold_neutral_creep = 13;
}
message Player {
  optional uint32 account_id = 1; optional uint32 player_slot = 2; repeated Death death_details = 3; repeated Stats stats = 5; optional int32 team = 6;
  optional uint32 kills = 8; optional uint32 deaths = 9; optional uint32 assists = 10; optional uint32 net_worth = 11;
  optional uint32 hero_id = 12; optional uint32 level = 18;
}
message Path {
  optional uint32 player_slot = 1; optional float x_min = 2; optional float y_min = 3; optional float x_max = 4; optional float y_max = 5;
  repeated uint32 x_pos = 6 [packed = true]; repeated uint32 y_pos = 7 [packed = true]; repeated uint32 health = 9 [packed = true];
  repeated int32 combat_type = 10 [packed = true]; repeated int32 move_type = 11 [packed = true];
}
message Paths { optional uint32 version = 1; optional float interval_s = 2; optional uint32 x_resolution = 3; optional uint32 y_resolution = 4; repeated Path paths = 5; }
message MatchInfo {
  optional uint32 duration_s = 1; optional int32 winning_team = 3; repeated Player players = 4; optional uint32 start_time = 5;
  optional uint64 match_id = 6; optional int32 game_mode = 9; optional int32 match_mode = 10; optional Paths match_paths = 12;
}
message CMsgMatchMetaDataContents { optional MatchInfo match_info = 2; }
`;

const root = protobuf.parse(PROTO, { keepCase: true }).root;
const MetaData = root.lookupType("CMsgMatchMetaData");
const Contents = root.lookupType("CMsgMatchMetaDataContents");

export type Position = { x : number, y : number, z : number };

export type Death = {
    game_time_s : number,
    time_to_kill_s : number,
    killer_player_slot : number,
    death_pos? : Position,
    killer_pos? : Position,
    death_duration_s : number
};

// Running totals at a timestamp, snapshots come every 3-5 minutes plus one at the end
export type Stats = {
    time_stamp_s : number,
    net_worth : number,
    gold_player : number,
    gold_boss : number,
    gold_treasure : number,
    gold_denied : number,
    gold_death_loss : number,
    gold_lane_creep : number,
    gold_neutral_creep : number
};

export type Player = {
    account_id : number,
    player_slot : number,
    death_details : Death[],
    stats : Stats[],
    team : number,
    kills : number,
    deaths : number,
    assists : number,
    net_worth : number,
    hero_id : number,
    level : number
};

export type Path = {
    player_slot : number,
    x_min : number,
    y_min : number,
    x_max : number,
    y_max : number,
    x_pos : number[],
    y_pos : number[],
    health : number[],
    combat_type : number[],
    move_type : number[]
};

export type MatchInfo = {
    duration_s : number,
    winning_team : number,
    players : Player[],
    start_time : number,
    match_id : number,
    game_mode : number,
    match_mode : number,
    match_paths? : { version : number, interval_s : number, x_resolution : number, y_resolution : number, paths : Path[] }
};

export type Meta = { version : number, info : MatchInfo };

const toObject = (msg : protobuf.Message) => msg.$type.toObject(msg, { longs: Number, defaults: true, arrays: true });

export function decodeMeta(bytes : Uint8Array) : Meta {
    const outer = toObject(MetaData.decode(bytes)) as { version : number, match_details : Uint8Array };
    const contents = toObject(Contents.decode(outer.match_details)) as { match_info? : MatchInfo };
    if(!contents.match_info) throw new Error("No match_info in metadata");
    return { version: outer.version, info: contents.match_info };
}
