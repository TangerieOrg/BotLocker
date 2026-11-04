# Replays (`replays/`)

A separate Deno app in the same repo and compose project. It shares no code with the bot. It reads the bot's `match_salts` over remote-sqlite, downloads each match's metadata file from Valve, and stores it in its own SQLite for analysis. Run its commands from `replays/` (`deno task dev`, `check`, `dead`, `heatmap`; `deno lint`). Dev only reads the prod bot database, so running it alongside prod is harmless.

## Why metadata and not demos

- **Demos expire:** Valve deletes `.dem.bz2` demos about 28–30 days after the match. They're also 20–330 MB each.
- **Metadata is permanent:** `.meta.bz2` files are ~150 KB and were still there for 2024 matches. They hold `CMsgMatchMetaDataContents`, which has:
  - every player's stats;
  - `death_details`: time, respawn wait, time to kill, killer slot, and both positions;
  - `match_paths`: x/y, health %, combat type and move type for all players at 1 Hz.
- **Demo parsing:** demos (via `@deademx/deadlock`) would be a second source if per-tick data, damage events or ability use are ever needed.

## Flow

```
bot match_salts (ws://bot:8080) ──▶ ingest table ──▶ http://replay{cluster}.valve.net/1422450/{match}_{metadata_salt}.meta.bz2
                                                                  │ zstd or bzip2, then protobuf
                                       matches / players / deaths / positions ◀─┘
```

- **`ingest.ts`:**
  - Every `POLL_INTERVAL_MS` it pulls every `match_salts` row with a metadata salt (a few thousand rows, read whole) and inserts the new ones as `pending`.
  - It then works through due rows newest first, `INGEST_CONCURRENCY` at a time.
  - A failure backs off from 10m doubling up to 24h, and becomes `failed` after 5 attempts.
  - Not reaching the bot (it starts alongside on a deploy) is logged and retried a minute later.
- **`meta/fetch.ts`:** the files keep the `.bz2` name but newer ones are zstd, so the format is picked by magic bytes. zstd goes through `node:zlib`, bzip2 through `seek-bzip`.
- **`meta/proto.ts`:** an inline subset of `citadel_gcmessages_common.proto` (SteamDatabase/Protobufs), the same approach as `src/steam/gc.ts`. Add fields there when a new analysis needs them. Old matches can only gain them by being re-ingested; set their `ingest.status` back to `pending`, since `saveMeta` replaces a match's rows.
- **`db/server.ts`:** serves `replays.sqlite3` read-only on `DB_PORT`. Traefik routes it at `/botlocker-replays` with `lan-only@file`, so it's `ws://media/botlocker-replays`.

The ~5.3k match backfill takes minutes to an hour depending on Valve's latency. It comes to roughly 650 KB per match in SQLite, almost all of it `positions`.

## Schema (`db/connection.ts`)

| Table | Key | Notes |
|---|---|---|
| `ingest` | `match_id` | Copy of the salts plus `status` (`pending`, `done` or `failed`), `attempts`, `next_attempt_at`, `last_error` |
| `matches` | `match_id` | `start_time`, `duration_s`, `winning_team`, `game_mode`, `match_mode` (same values as the bot), `meta_version` |
| `players` | `(match_id, slot)` | All players in the lobby, not just linked ones. `slot` is the metadata `player_slot`, and `team` compares to `matches.winning_team` |
| `deaths` | none, indexed `(match_id, slot)` | `t` is game seconds and `duration_s` is the respawn wait. `killer_slot` 0 means it wasn't a player (troopers, guardians and so on). Positions are world units |
| `positions` | `(match_id, slot, t)` | One row a second per player, in world units rounded to integers. `health` is a percentage, 0 while dead |

| View | What |
|---|---|
| `time_dead` | One row per player per match: `deaths`, `dead_s` (each death capped at the match end), `dead_pct`, `longest_s`, `won` |
| `death_spots` | `deaths` with the victim's and the killer's account and hero, plus the match's time and modes |

World coordinates are centred on the map with y up. The minimap from `https://api.deadlock-api.com/v1/assets/map` is a square of side `2 * radius`, so image `u = (x + r) / 2r` and `v = (r - y) / 2r`.

## CLIs

Both read `ws://media/botlocker-replays` and `ws://media/botlocker-db`. `--db` and `--bot` take another URL or a local file path. Names come from the bot's `links`, `discord_names`, `steam_names` and `heroes`, and `--account` takes an id or part of a linked player's name.

- **`deno task dead`:** time spent dead per linked player. With `--account`, it breaks that down per hero and lists their last 15 matches. Filters are `--days N` and `--mode unranked|ranked|brawl`.
- **`deno task heatmap --account x`:** writes an SVG to `out/`.
  - `--kind presence` is where they spend time alive, binned in SQL on a log scale.
  - `--kind deaths` is where they died, and `--kind kills` is where they stood for each kill.
  - It takes the same filters plus `--hero`. Hovering a mark shows details.
