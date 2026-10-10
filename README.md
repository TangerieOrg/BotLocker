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

## How it works

Everything comes from a dedicated Steam account (needs Deadlock access) asking the Deadlock game coordinator for match history. Set `STEAM_BOT_USERNAME`, `STEAM_BOT_PASSWORD` and `CHANNEL_ID` (the one channel wins and losses are announced in)

- Players add the BotLocker Steam account as a friend, then `/link` and pick themselves from the list. The bot accepts any friend request, and sends one to linked players if the account isn't limited
- The first time it sees someone it stores about 3 months of history without announcing it
- When a linked friend stops playing Deadlock their history is checked a few times over the next 10 minutes, anything new is announced
- Everyone is also checked every `GC_POLL_INTERVAL_MS` (1 hour) as a backstop
- `/leaderboard` is the loserboard since the last `/resetrecord`
- `/online` shows who's in Deadlock, online on Steam or played recently, the bot status rotates through the same, and @ing the bot gets a reply about your last game. Online status only covers friends of the Steam bot
- If the Steam login needs a Steam Guard code it DMs the owner, send it with `/steamguard`. The login token is saved after that

State lives in small `@tangerie/global-store` stores (`SteamStore`, `LinkStore`, `BoardStore`, `TrackerStore`, `DiscordStore`), the rest are effects in `start*` functions that react to them
