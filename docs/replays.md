# Replays (`replays/`)

A separate Deno app in the same repo and compose project. It shares no code with the bot. It reads the bot's `match_salts` over remote-sqlite, downloads each match's metadata file from Valve, and stores it in its own SQLite for analysis. Run its commands from `replays/` (`deno task dev`, `check`, `dead`, `heatmap`, `animate`; `deno lint`). Dev only reads the prod bot database, so running it alongside prod is harmless.

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
- **`meta/proto.ts`:** an inline subset of `citadel_gcmessages_common.proto` (SteamDatabase/Protobufs), the same approach as `src/steam/gc.ts`. Add fields there when a new analysis needs them.
- **Re-ingesting:** to store something new for old matches, bump `INGEST_VERSION` in `db/ingest.ts`. On start, every `done` match stored at an older version goes back to `pending`, and `saveMeta` replaces its rows. A full re-ingest takes the server about 10 minutes.
- **`db/server.ts`:** serves `replays.sqlite3` read-only on `DB_PORT`. Traefik routes it at `/botlocker-replays` with `lan-only@file`, so it's `ws://media/botlocker-replays`.

The ~5.3k match backfill takes minutes to an hour depending on Valve's latency. It comes to roughly 650 KB per match in SQLite, almost all of it `positions`.

## Schema (`db/connection.ts`)

| Table | Key | Notes |
|---|---|---|
| `ingest` | `match_id` | Copy of the salts plus `status` (`pending`, `done` or `failed`), `attempts`, `next_attempt_at`, `last_error`, and the `version` it was stored at |
| `matches` | `match_id` | `start_time`, `duration_s`, `winning_team`, `game_mode`, `match_mode` (same values as the bot), `meta_version` |
| `players` | `(match_id, slot)` | All players in the lobby, not just linked ones. `slot` is the metadata `player_slot`, and `team` compares to `matches.winning_team` |
| `stats` | `(match_id, slot, t)` | The metadata's running totals, every 3–5 minutes plus one at the end: `net_worth` and souls by source (`souls_player`, `souls_lane`, `souls_neutral`, `souls_boss` and so on) |
| `deaths` | none, indexed `(match_id, slot)` | `t` is game seconds and `duration_s` is the respawn wait. `killer_slot` 0 means it wasn't a player (troopers, guardians and so on). Positions are world units |
| `positions` | `(match_id, slot, t)` | One row a second per player, in world units rounded to integers. `health` is a percentage, 0 while dead |

| View | What |
|---|---|
| `time_dead` | One row per player per match: `deaths`, `dead_s` (each death capped at the match end), `dead_pct`, `longest_s`, `won` |
| `death_spots` | `deaths` with the victim's and the killer's account and hero, plus the match's time and modes |

## Map eras and cleaning positions

Every era uses one world frame: centred on the map, y up, team 0 at the bottom. The minimaps from deadlock-api are squares of side `2 * 10752` world units, so image `u = (x + r) / 2r` and `v = (r - y) / 2r`. Only the layout and image change between eras. `cli/maps.ts` lists the eras with their dates (from deadlock.wiki), image URLs and the square each image covers:

| Era | Matches | Minimap |
|---|---|---|
| `4lane` | until 2025-02-25 | The deadlock.wiki in-game capture, checked by eye against lane positions. Labelled approximate |
| `3lane` | 2025-02-25 to 2026-01-22 | deadlock-api `minimap.png` |
| `ognb` | 2026-01-22 to 2026-09-29 | The same image. Old Gods, New Blood reworked the bases after it was drawn, which is noted on the output |
| `cns` | 2026-09-29 on (the default) | deadlock-api `minimap_midtown_mid.png` |

- **Downloads:** images download on first use into `replays/cache/` (gitignored). They're Valve's art and the repo is public.
- **New layout:** when Valve changes the map, add an era and point the default at it.

Positions need cleaning before they're drawn (`CLEAN_POSITIONS`):
- Before Aug 2025 the metadata parks heroes off the map (x ≈ −13000) before they spawn and while dead.
- From Aug 2025 to Jan 2026, everyone sits at the map centre for the first few seconds.
- The filter keeps samples inside the map square, alive, and from t ≥ 10 s. Deaths are kept only when they're inside the square.

## CLIs

The CLIs read `ws://media/botlocker-replays` and `ws://media/botlocker-db`. `--db` and `--bot` take another URL or a local file path. Names come from the bot's `links`, `discord_names`, `steam_names` and `heroes`.

Shared flags:
- **`--account`:** an id or part of a linked player's name. For the heatmaps it can be a comma-separated list, which pools those players into one set of player-matches. A match two of them shared counts once for each.
- **`--mode`:** `standard` (normal matches, ranked or not; the default), `ranked`, `unranked` or `brawl`. Street Brawl is about 16 minutes against 37, so it's never mixed in.
- **Other filters:** `--days N`, plus `--hero` and `--era` on the heatmaps.

Commands:
- **`deno task dead`:** time spent dead per linked player. With `--account`, it breaks that down per hero and lists their last 15 matches.
- **`deno task heatmap`:** writes an SVG to `out/`.
  - `--kind presence` is where they spend time alive, binned in SQL on a log scale.
  - `--kind deaths` is where they died, and `--kind kills` is where they stood for each kill.
  - Hovering a mark shows details.
- **`deno task animate`:** an MP4 over the game clock. It needs `ffmpeg` (libx264) and `rsvg-convert`. The local ffmpeg has no text drawing, so each frame is an SVG rasterised by `rsvg-convert` and piped to ffmpeg as PNGs.
  - **Heat layer:** `--heat presence|souls|none`. Souls are an estimate: the metadata has no soul positions, so each snapshot's net worth gain is spread over that player's alive samples since the last snapshot.
  - **Dots:** `--dots deaths,kills|none`. Each dot fades in and out over its window.
  - **Averaging:** each frame covers the 3 minutes around its clock time. Heat comes in 30 s buckets, each divided by the player-matches still running at its midpoint. The legend gives deaths and kills per match for the window.
  - **Scale:** one colour scale for the whole video, clipped at the 99th percentile so spawn at 0:00 doesn't set it. Shown as a square root.
  - **End and speed:** the video stops once under 10% of the player-matches are still going. `--speed` is game seconds per video second (default 60, at 12 fps).
