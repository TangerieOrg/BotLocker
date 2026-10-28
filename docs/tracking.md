# Tracking and announcing matches

## Steam accounts (`steam/client.ts`)

- `STEAM_USERS` is `user|pass,user|pass`. The first account is the **main** bot. It is the only one that has friends, sees presence and pulls match history. Any others only fetch salts (see `salts.md`).
- Every extra account is on demand (`account.onDemand`). It stays logged out and offline. `account.session(fn)` logs it in, waits for the GC, runs `fn` and logs out. It never calls `setPersona`, and `autoRelogin` is off so a kick (`playingState` blocked, or someone else logging in) ends the session instead of fighting back. The first run logs in once to learn the account id (`kv` `steam_self:<username>`) and save the token. After a failed or kicked session it waits 15m. A Steam Guard code that never arrives within 10m sets the login to `failed` until restart.
- A trailing `|lazy` (`user|pass|lazy`) marks an extra account as a personal one. On top of the above, `account.available()` is only true when its owner isn't in a game: the main bot has to be friends with it, and its `activityFromStatus` in `SteamStore.online` must be offline or plain `online` (Steam open, nothing running). A session plays Deadlock and Steam allows one running game per account, so any game, Deadlock menus included, would be kicked off, and friends see the owner flip to "In-Game: Deadlock" for the few seconds a session lasts. If the owner starts a game mid-session, `playingState` logs the session off and starts a 15m cooldown. It also waits 1m after every session so the owner's presence settles. An invisible owner looks offline, so it can't be detected.
- Main account state is at the top level of `SteamStore` (`login`, `self`, `gcReady`). Extra accounts are in `SteamStore.bots`, keyed by username. The `main ? setLogin(...) : setBot(...)` pattern in `createAccount` hides the difference.
- Login tries the saved refresh token from `kv` first. If Steam asks for a Steam Guard code, the bot uses stdin when there's a terminal. Otherwise the login state becomes `{ state: "guard", submit }`. `discord/guard.ts` DMs the owner, and `/steamguard` calls `submit`.
- Main relies on steam-user's `autoRelogin` after a disconnect, but that can stall without an error (it once sat logged out for 1h40m after a `NoConnection` drop). So if main isn't logged on again within 5m, `watchRelogin` calls `logOff` and `logOn` itself, and repeats every 5m until it is.
- Steam stops showing main as in Deadlock after a long session, so every 6h (`MAIN_REFRESH_MS`) main logs off and straight back on. GC requests pause for those few seconds.
- `gcReady` becomes true once the GC answers the hello loop. GC requests only work while it's true, and the tracker's runner stops arming timers while it's false.

## Presence → "finished a match"

- Steam pushes persona updates. Rich presence for Deadlock players is also polled every 30s because Steam doesn't reliably push it. Both paths go through `updateStatus` → `setOnline`.
- `setOnline` in `SteamStore` decides whether someone is in a match from `steam_display` (an `#steam_citadel_ingame...` prefix). It tracks `inMatch` (id → minutes in), and it bumps `finished[id]` when a round ends. A round counts as ended when they leave it, close the game, or the minutes go backwards (straight into a new match).
- `parties` remembers each player's last `steam_player_group`, even after they go offline, so the announcer can group party mates.

## History checks (`tracker/`)

Only linked players who are Steam friends with the bot are tracked, because the GC returns history only for friends.

The tracker queues a check in three cases:

| Trigger | Check |
|---|---|
| Account becomes tracked (bot start, new link, new friend) | `followUp(id, 0, now)` |
| `finished[id]` bumped | `followUp(id, 0, now + 30s)` |
| Every `GC_POLL_INTERVAL_MS` (1h) | `queue(id, now)` backstop |

A follow-up that finds nothing is retried at 30s, 2m, 5m and 10m (`CHECK_DELAYS_MS`) because the match can take a while to appear in history. The runner keeps one timer per check and re-arms whenever `checks` or `gcReady` changes. GC history requests are serialized with a 2s gap, and the GC pauses for 1h if it rate limits.

`syncHistory(accountId)` fetches page 1 of GC history and inserts it. The return value is the number of new, unannounced rows.

- **Backfill**: the first time an account is seen, or when `BACKFILL_VERSION` in `tracker/history.ts` changes, the bot pages back through GC history (up to 50 pages) and tops up from deadlock-api's archive. All of it goes in as already announced. Bump `BACKFILL_VERSION` to make every account backfill again.
- `insertMatches` drops anything that isn't unranked or ranked, and drops early-ended games (all stats zero). It also creates the `match_salts` row for each match.

## Announcing (`announce/`)

- The announcer runs a single-flight pass (`SemaphoreQueue(1)`) when `DiscordStore.channel` is set and whenever `TrackerStore.recorded` bumps. Each pass reads every `announced_at IS NULL` row, grouped by match.
- **Party hold**: if a linked player who was in the same Steam party doesn't have the match stored yet and still has a pending check or is still in a round (`inMatch`), the match waits up to 3 minutes so party mates can go in one message. The in-round part matters because one player's GC history can show the match before Steam presence says the rest have left it.
- The bot posts one embed per team per match: a solo embed or a party embed. Players on both teams get separate messages. A player is skipped if they are unlinked, not in the guild, or the match ended more than `MAX_NOTIFY_AGE_H` ago.
- Rows are marked announced even if sending fails, so one bad match can't loop forever. With `SEND_DISCORD_MESSAGE=0` (as in `deno task dev`) the bot logs the messages instead of posting them.
- The embed text comes from `lines/`: an insult or compliment, plus a tilt line, a win-streak line or a streak-broken line based on `getStreak`.
