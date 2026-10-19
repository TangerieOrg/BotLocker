# Architecture

## Stores and effects

State lives in four `@tangerie/global-store` stores: `SteamStore`, `LinkStore`, `TrackerStore` and `DiscordStore`. Each one is defined with `createStore({ state, actions })`. Its actions are destructured and exported (`export const { link, unlink } = LinkStore.actions`), and so are its selectors (`LinkStore.selector(...)`), which work as plain functions such as `getUser(accountId)`.

Effects are `start*()` functions. They subscribe to stores and do the side effects: network calls, timers, Discord messages, and database writes. An effect never pokes another effect directly. It changes a store, and the store notifies whoever is watching. For example, the tracker bumps `TrackerStore.recorded` when it stores new matches, and the announcer reacts to that change.

`src/helpers/store.ts` has the subscription helpers every effect uses:

- `watch(store, selector, cb)` works like `subscribe`, but also runs once straight away with `prev = undefined`
- `watchAll(stores, compute, cb, equals?)` computes a value from several stores (often using selectors). `cb` runs only when `equals` says the value changed. Use `setEquals` for `Set` results
- `diffSet` and `diffMap` give what was added, changed or removed between `cur` and `prev`. Effects that should act only on what's *new* use them, such as friend requests, follow-up checks and link persistence

The usual pattern is "compute the wanted set, then act on `diffSet(cur, prev).added`". For example, `steam/friends.ts` sends a friend request only when an account first becomes wanted, so a request that failed is not retried until the relationship changes.

## Startup (`src/main.ts`)

1. Importing modules has side effects. `db/connection.ts` creates the data dir and the schema with a top-level `await`, and `LinkStore` loads links from SQLite at import time.
2. Effects start: `startFriends`, `startTracker`, `startAnnouncer`, `startGuardNotice`, `startPresence`, `startSalts`. They do nothing useful until the stores fill up.
3. `startSteam()` logs in every `STEAM_USERS` account. The first account is `main` and stays logged in. The others are salt-only and on demand: 5s apart, each does a one-off setup login if it has no saved token or account id, and after that only logs in per fetch (see `tracking.md`).
4. `startDiscord()` loads the slash commands and logs in. On ready it fetches `CHANNEL_ID`, registers the commands to that channel's guild only (and clears any global ones), then calls `setChannel`. Anything waiting on `DiscordStore.channel` (announcer, presence, guard DMs) starts at that point.

A missing `DISCORD_TOKEN`, `CHANNEL_ID` or `STEAM_USERS`, or a bad channel, calls `Deno.exit(1)`.

## Module map

| Folder | What's there |
|---|---|
| `steam/` | `client.ts`: steam-user accounts, login and Steam Guard, the GC hello loop, `gcJob`, presence and rich presence polling, `addFriend`/`fetchPersona`. `gc.ts`: the protobuf GC requests (match history, salts) and their rate limiting. `friends.ts`: the auto-friend effect. `activity.ts`: turns presence into an `Activity` tier (match > queue > deadlock > game > online) |
| `tracker/` | `TrackerStore`, `effects.ts` (when to check whose history), `history.ts` (`syncHistory` and backfill) |
| `announce/` | `effects.ts` (posting unannounced matches, holding for party mates) and `embed.ts` (building the embed) |
| `salts/` | `effects.ts`, the whole salt pipeline |
| `deadlock/` | deadlock-api HTTP: `assets.ts` (hero and rank names, icons, cached for 24h), `history.ts` (archived history for backfill), `salts.ts` (stored salts read, upload) |
| `db/` | SQLite access, re-exported from `db/mod.ts` |
| `discord/` | Client, command loader, `commands/*.ts`, the presence rotation, mentions, guard DMs, embed helpers, `isOwner` |
| `lines/` | All the roast and praise text pools, plus the logic for picking and filling them |
| `links/` | `LinkStore` |
| `helpers/` | Store helpers, `logger`, `now()` (unix seconds), the loss window, stats maths, Steam id conversion |

## IDs

- Inside the bot, Steam accounts are always the 32-bit **account id** (`number`), which is the same number deadlock-api and the GC use. Convert to a 64-bit SteamID with `toSteam64` (`helpers/steam.ts`) only when calling Steam.
- Discord users are snowflake strings.
