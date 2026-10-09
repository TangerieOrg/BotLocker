# BotLocker

Announces when someone loses a Deadlock match and humiliates them (and other fun stuff)

## Local

Copy `.env.example` to `.env`, add your token, then `deno task dev`

## Deploy

Pushing to `main` builds `docker.tangerie.xyz/botlocker` and deploys it as the `botlocker` swarm stack, served at `/deadlock`

Env vars come from the `BotLockerEnv` docker secret (same format as `.env`), create it on the swarm manager first

```sh
docker secret create BotLockerEnv .env
```

## Match data

deadlock-api.com is checked first for everything since it's free, but it can lag behind. A dedicated Steam account (needs Deadlock access) fills the gaps by asking the Deadlock game coordinator directly, its requests are limited so it's only used when deadlock-api doesn't have something yet

- deadlock-api history is polled every `POLL_INTERVAL_MS` (2 minutes)
- When a linked friend of the Steam bot stops playing Deadlock, their history is checked (deadlock-api, then the Steam bot) a few times over the next 10 minutes
- The Steam bot also checks everyone every `GC_POLL_INTERVAL_MS` (1 hour) as a backstop
- Full scoreboards for `/match` come from storage, then deadlock-api, then the Steam bot (capped at 40 a day)
- Set `STEAM_BOT_USERNAME` and `STEAM_BOT_PASSWORD` to enable the Steam bot. If it needs a Steam Guard code it DMs the owner, send it with `/steamguard`. The login token is saved after that
- `/link` sends the player a friend request from the Steam bot, their matches only come through it once they accept
- `deno task steam-test <account_id>` checks the Steam bot end to end

## Match ingest

Matches can also be pulled straight from Valve using the salts in the Steam client's download cache

- `POST /ingest/salts` takes `[{ match_id, cluster_id, metadata_salt }]` (same shape as deadlock-api's), fetches the `.meta.bz2` from Valve, stores it and announces it for any linked players
- `GET /ingest/salts/:matchId` shows how that went
- `deno task fetch-match <match_id> <cluster> <salt> [--server url]` sends one by hand

### Watcher

`ingest/main.ts` watches `Steam/appcache/httpcache` and sends any salts it finds to BotLocker (metadata only) and to deadlock-api.com's `/v1/matches/salts` (metadata and replay), so nobody needs deadlock-api-ingest as well. Tagging a release builds `botlocker-ingest.exe` and attaches it with `install.ps1`

Install or update on Windows (runs at logon, logs to `%LOCALAPPDATA%\botlocker-ingest\ingest.log`)

```powershell
irm https://github.com/TangerieOrg/BotLocker/releases/latest/download/install.ps1 | iex
```

Uninstall

```powershell
& ([scriptblock]::Create((irm https://github.com/TangerieOrg/BotLocker/releases/latest/download/install.ps1))) -Uninstall
```

Flags: `--server <url>`, `--steam <steam dir>`, `--no-deadlock-api` (only send to BotLocker), `--deadlock-api-url <url>`, `--once` (scan, send and exit)
