# Match salts (`salts/effects.ts`)

Salts let deadlock-api download a match's metadata and replay. BotLocker contributes salts for its players' matches that deadlock-api doesn't already have. This runs separately from tracking and announcing. A salt failure never affects announcements.

## Flow

Each stored match has one row in `match_salts`. `insertMatches` creates it, and `seedSalts` runs every 3h to catch any match that's missing one. A row is due once `salt_check_after` (match end + `SALT_DELAY_MS`, default 30m) has passed. The delay gives deadlock-api's own ingest time to get the match first.

```
pending ──deadlock-api has its salts──▶ covered            (salts saved)
   └─────doesn't have them───────────▶ missing ──GC fetch──▶ fetched ──upload──▶ uploaded
                                     └── retries with backoff, failed after 5 attempts or a GC InvalidMatch/InvalidPermission
```

- **Checks** (`runChecks`) read the stored salts from deadlock-api for 100 rows at a time (`getStoredSaltsFor`, one `GET /{id}/salts?disable_steam=true` per match, 10 at a time, which never goes to Steam). A row is `covered` only if deadlock-api has a salt for it. Having the match's metadata doesn't count, because we can fetch that ourselves from a salt. A failed read throws and pauses checks, so an error is never taken for "no salt". These are read-only, so they still run when `SALT_UPLOAD=0`.
- **Recheck** (`recheckMissing`) runs on the first tick after startup and then every 24h. It pages through every `missing` row, due or not, asks deadlock-api for their salts and marks the ones it has as `covered`. If deadlock-api errors mid-way it retries on a later tick.
- **Fetches** (`fetchLoop`, one loop per Steam account, started only when `account.available()`) send one GC salt request per `SALT_FETCH_INTERVAL_MS` (3h), up to `SALT_FETCH_DAILY_CAP` (8) per rolling 24h per account. Loops start 5s apart per account so the extras don't log in together. `inFlight` stops two accounts from taking the same match. Every extra account is on demand and runs the request inside `account.session`, so it only logs in once `pickMissing` has found something to fetch, and logs out after. Before each request `pickMissing` reads stored salts for the next due `missing` rows, 10 at a time, until it finds one deadlock-api still lacks. Any it has salts for since are marked `covered` (like a normal check) and skipped, so only matches it really lacks spend the allowance. If deadlock-api errors, no GC request goes out that round.
- Bot accounts used to run at 30m and got about 10 salts before the GC rate limited them, then about 10 more after each 30h pause. On 10-25 all three were rate limited on the first request after the pause, so the bot cadence was cut to stay well under that, and a limited bot now probes every `SALT_RATE_LIMIT_PAUSE_H` (6h).
- Personal (`|lazy`) accounts get far more from Steam and have their own `SALT_PERSONAL_FETCH_INTERVAL_MS` (15m), `SALT_PERSONAL_FETCH_DAILY_CAP` (96) and `SALT_PERSONAL_RATE_LIMIT_PAUSE_H` (30h). 15m ran for days without a limit, while 10m and an alternating 5m/10m trial were both rate limited after about 7h.
- **Target trial**: accounts listed in `SALT_TARGET_USERS` set `target_account_id` on the request to a tracked player from the match (`getMatchPlayer`). deadlock-api-ingest and the mod manager only send `match_id`. Their log lines say `target <id>` so they can be compared against the accounts that don't.
- **Uploads** (`runUploads`) send batches of up to 50, grouped by the account that fetched them. The uploader is credited as `botlocker:<account id>` from `source = "gc:<id>"`. If deadlock-api returns 400, the batch is split up to find the bad entry.
- Due rows are ordered so that "live" matches (ended within the last 6h) go first, then the backlog from oldest to newest.

## Rate limits

- The GC salt limit is tight and Valve doesn't publish it. The bot copies deadlock-api-ingest's behaviour: if the GC returns `RateLimited`, `exhaustFetchLog` fills that account's 24h log with entries dated to age out after the account's pause (6h for bots, 30h for personal accounts, since one retried at exactly 24h got rate limited again), so the account stops fetching until then. Fetch logs are stored in `kv` (`salt_fetch_log` for main, `salt_fetch_log:<username>` for the others), so the limits still apply after a restart. When a limit hits, `exhaustFetchLog` also stores how many fetches the account had made before it (`salt_rate_limit`), which `/status` shows per account.
- A request that errors after leaving the bot still counts against the cap. "Not connected" errors don't count, because those requests never left.
- Any deadlock-api error pauses checks and uploads for 5 minutes (`saltState.apiPausedUntil`).
- On the main account, salt requests share the GC queue and the 2s spacing with history requests, but not history's 1h rate-limit pause. Extra accounts each have their own queue.

These limits have been tuned repeatedly from live behaviour; see `git log -- src/salts`. Before changing the cadence or cap, check the live logs (`[Salts]`) and the owner-only `/status` command, which shows counts by status, overdue rows, recent failures and each account's 24h budget and next slot.
