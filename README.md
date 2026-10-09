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
