# Data

Everything is in one SQLite file, `${DATA_DIR}/botlocker.sqlite3` (WAL). steam-user keeps its own files in `${DATA_DIR}/steam`. In prod, `DATA_DIR=/data` is a Docker volume.

## Reading the prod database

Don't `docker exec` into the bot to read prod. The bot itself serves the file read-only through `@tangerie/remote-sqlite` (`db/server.ts`, on `DB_PORT`, default 8080), routed by Traefik at `/botlocker-db` on the `web` entrypoint with the `lan-only@file` middleware, so no host port: `ws://media/botlocker-db`. Use the `/anthropic-skills:remote-sqlite` skill against that URL, for example `remote_sqlite.py ws://media/botlocker-db tables`. It can't write. For a write, like resetting a `kv` key, use the `docker exec` route in `botlocker-bot-1`.

## Schema (`db/connection.ts`)

| Table | Key | Notes |
|---|---|---|
| `links` | `user_id` | Discord user → `account_id` (unique). Mirrors `LinkStore`, which is the source of truth while the bot is running |
| `matches` | `(account_id, match_id)` | One row per tracked player per match. `won` is 0/1. `badge` and `ranked_delta` are set only for ranked games. `announced_at` is NULL until the match is posted; backfilled rows are stored already announced |
| `match_salts` | `match_id` | One row per match. `status` is one of `pending`, `missing`, `fetched`, `uploaded`, `covered` or `failed` (see `salts.md`) |
| `kv` | `key` | Small persistent state, listed below |

There are no migrations. The schema is a `CREATE TABLE IF NOT EXISTS` block that runs on import, so a new column or table needs to work against the existing prod database. Add new tables to the block. For a new column, add an explicit `ALTER TABLE` that's safe to run twice. Editing the `CREATE TABLE` alone does nothing to an existing database.

## `kv` keys

| Key | Value |
|---|---|
| `steam_refresh_token`, `steam_refresh_token:<username>` | Saved Steam login for the main account and the extra accounts |
| `backfilled:<account_id>` | The `BACKFILL_VERSION` this account was last backfilled at |
| `salt_fetch_log`, `salt_fetch_log:<username>` | JSON array of GC salt request times (unix s) in the last 24h, for main and the extra accounts |

## Writing DB code

- Each query function is wrapped in `asDbFunction((db, ...args) => ...)`. The wrapper opens a connection for the call, closes it afterwards, and turns the function async. Use `transaction(db, fn)` when several writes need to happen together.
- Use `using stmt = db.prepare<RowType>(...)` so statements are freed. SQL strings start with `--sql` for editor highlighting.
- Row types are in `db/types.ts`. Everything is re-exported from `db/mod.ts`; import from there.
- Times are unix seconds.
