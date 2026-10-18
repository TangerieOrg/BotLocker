# Match salts (`salts/effects.ts`)

Salts let deadlock-api download a match's metadata and replay. BotLocker contributes salts for its players' matches that deadlock-api doesn't already have. This runs separately from tracking and announcing. A salt failure never affects announcements.

## Flow

Each stored match has one row in `match_salts`. `insertMatches` creates it, and `seedSalts` runs every 3h to catch any match that's missing one. A row is due once `salt_check_after` (match end + `SALT_DELAY_MS`, default 30m) has passed. The delay gives deadlock-api's own ingest time to get the match first.

```
pending ──deadlock-api has it──▶ covered            (salts saved if deadlock-api returns them)
   └─────doesn't have it───────▶ missing ──GC fetch──▶ fetched ──upload──▶ uploaded
                                     └── retries with backoff, failed after 5 attempts or a GC InvalidMatch/InvalidPermission
```

- **Checks** (`runChecks`) query deadlock-api metadata for 100 rows at a time, at most 30 queries a minute. These are read-only, so they still run when `SALT_UPLOAD=0`.
- **Fetches** (`fetchLoop`, one loop per Steam account) send one GC salt request per `SALT_FETCH_INTERVAL_MS` (30m), up to `SALT_FETCH_DAILY_CAP` (40) per rolling 24h per account. `inFlight` stops two accounts from taking the same match. Before each request `pickMissing` asks deadlock-api about the next 100 due `missing` rows. Any it has picked up since are marked `covered` (like a normal check) and skipped, so only matches it really lacks spend the allowance. If deadlock-api errors, no GC request goes out that round.
- **Uploads** (`runUploads`) send batches of up to 50, grouped by the account that fetched them. The uploader is credited as `botlocker:<account id>` from `source = "gc:<id>"`. If deadlock-api returns 400, the batch is split up to find the bad entry.
- Due rows are ordered so that "live" matches (ended within the last 6h) go first, then the backlog from oldest to newest.

## Rate limits

- The GC salt limit is tight and Valve doesn't publish it. The bot copies deadlock-api-ingest's behaviour: if the GC returns `RateLimited`, `exhaustFetchLog` fills that account's 24h log, so the account stops fetching for a full day. Fetch logs are stored in `kv` (`salt_fetch_log` for main, `salt_fetch_log:<username>` for the others), so the limits still apply after a restart.
- A request that errors after leaving the bot still counts against the cap. "Not connected" errors don't count, because those requests never left.
- Any deadlock-api error pauses checks and uploads for 5 minutes (`saltState.apiPausedUntil`).
- On the main account, salt requests share the GC queue and the 2s spacing with history requests, but not history's 1h rate-limit pause. Extra accounts each have their own queue.

These limits have been tuned repeatedly from live behaviour; see `git log -- src/salts`. Before changing the cadence or cap, check the live logs (`[Salts]`) and the owner-only `/status` command, which shows counts by status, overdue rows, recent failures and each account's 24h budget and next slot.
