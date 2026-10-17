# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BotLocker is a Deno Discord bot. It watches linked players' Deadlock matches through a dedicated Steam account that talks to the Deadlock game coordinator (GC), then roasts losses and celebrates wins in one Discord channel. As a side job it fetches match salts and uploads them to deadlock-api. See `README.md` for what players see.

## Commands

```sh
deno task dev     # watch mode, SEND_DISCORD_MESSAGE=0 and SALT_UPLOAD=0 (nothing is posted or uploaded)
deno task start   # what prod runs
deno task check   # type check
deno lint
```

- There are no tests. Before shipping, run `deno task check` and `deno lint`. Both should pass cleanly.
- `deno task check` lists `src/discord/commands/*.ts` by name because commands are loaded with dynamic `import()` and wouldn't get checked otherwise. The `Dockerfile`'s `deno cache` line does the same thing. If you add another dynamically imported folder, add it to both.
- Don't run `deno fmt`. The code uses its own style (`if(x)`, `name : Type`, 4-space indent) and `deno fmt` would rewrite every file.
- Config comes from env vars, then `.env`, then `ENV_FILE` (the Docker secret in prod). See `src/env.ts`, `src/config.ts` and `.env.example`.
- Dev logs in to the same Discord bot and Steam accounts as prod when it uses the same `.env`. Two Steam sessions on one account kick each other off, and both bots will answer slash commands.

## Deploy

Pushing a `vX.Y.Z` tag runs `.github/workflows/main-bpd.yml`, which builds the image on the server and restarts the `botlocker` compose project. The live container is `botlocker-bot-1`; use `docker logs -f botlocker-bot-1` to watch it. SQLite and Steam data live in the external `botlocker_botlocker-data` volume.

## Architecture in brief

The bot is made of **state stores and effects** built on `@tangerie/global-store`. Steam events and Discord logins write to stores. Everything else is an effect that subscribes to a store and reacts. `src/main.ts` starts every effect first, then the Steam and Discord logins that get state moving.

```
Steam friend presence ──▶ SteamStore.finished ──▶ tracker queues checks ──▶ GC match history ──▶ SQLite matches
                                                                                         │
                                                       TrackerStore.recorded ◀───────────┘
                                                                 │
                                                       announcer ──▶ Discord channel embed (lines/ for the text)
SQLite matches ──▶ match_salts ──▶ deadlock-api check / GC salt fetch ──▶ deadlock-api upload
```

| Store | Holds |
|---|---|
| `SteamStore` (`src/steam/`) | Logins for every Steam account, friends and relationships, online and rich presence, who's in a match, party ids |
| `LinkStore` (`src/links/`) | Discord user → Deadlock account. Loaded from SQLite on import, and a subscription writes changes back |
| `TrackerStore` (`src/tracker/`) | Pending history checks per account, and a `recorded` counter the announcer watches |
| `DiscordStore` (`src/discord/`) | The announce channel (set once logged in, and only its guild is served) and the custom status text |

Read these before changing the matching area:

- `docs/architecture.md` covers the store and effect pattern, the `watch`/`watchAll` helpers, startup order and the module map
- `docs/tracking.md` covers Steam accounts and login, presence → match finished → history checks, backfill, and announcements with party holding
- `docs/salts.md` covers the salt pipeline, its status values and the GC and deadlock-api rate limits
- `docs/discord.md` covers slash commands, line pools, the rotating status and @mentions
- `docs/data.md` covers the SQLite schema, `kv` keys and how the database layer is written

## Conventions

- Comments are short, plain sentences with no trailing period. They explain why, not what. Match that density.
- Store state is changed only through store actions. Effects read state with `Store.get()` or selectors and react through `watch`/`watchAll`/`subscribe`. Put new cross-cutting state in a store rather than in module globals, unless the state is private to one effect, like the timers in `tracker/effects.ts` or `saltState` in `salts/effects.ts`.
- Each subsystem logs with `logger("Prefix")` from `helpers/log.ts`, so prod logs can be filtered by prefix (`[Tracker]`, `[Salts]`, `[Steam]`, `[Notify]`, ...).
- Times stored in SQLite and used in match data are unix **seconds** (`helpers/now.ts`). Timers and the `*_MS` config values are milliseconds.
- `match_mode` 1 = unranked and 4 = ranked; nothing else is stored. `game_mode` 4 = Street Brawl, which has no souls.
- Loss counts everywhere (loserboard, announcements, status lines) use the 2-week window in `helpers/window.ts`.

## Keep the docs current

Agents rely on this file and `docs/*.md` to understand the code without reading every file, so stale docs cost more than missing ones. **When an edit changes anything those files describe, update them in the same commit.** That includes behaviour, data flow, stores, schema, `kv` keys, config/env vars, commands, rate limits and deploy steps. Also update `README.md` when a change affects players or setup, and `.env.example` when you add or change an env var. Keep docs at the level of "how it fits together". Don't list things that are easy to find with grep.
