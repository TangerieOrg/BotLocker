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

## Match ingest

Instead of waiting for deadlock-api.com, matches can be pulled straight from Valve using the salts in the Steam client's download cache

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
