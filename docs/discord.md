# Discord side

## Slash commands

- Each file in `src/discord/commands/` is one command. It exports `data` (a `SlashCommandBuilder`), `execute`, and optionally `autocomplete`. `discord/commands.ts` imports every file in the folder at startup. To add a command, add a file; it registers on the next start, and nothing else needs listing.
- Commands are registered only to the announce channel's guild and use `.setContexts(InteractionContextType.Guild)`.
- Owner-only commands (`/adminlink`, `/status`, `/steamguard`) check `isOwner(interaction)` from `discord/util.ts`, which accepts `OWNER_ID` or the bot application owner.
- Replies are usually ephemeral. Slow commands call `deferReply` first, then `editReply`. Build embeds with `errorEmbed` and `successEmbed` from `discord/embeds.ts`.
- `handleInteraction` logs every command run and masks the `code` option. It also replies with a generic error if `execute` throws, so commands don't need their own try/catch.
- `/stats`, `/team` and `/leaderboard` attach a period dropdown (and `/team` a teammate user-select) via `interactive()` in `discord/interactive.ts`. It sends the first view, then re-renders when the command's user changes a control, using a collector on the reply that disables the controls after 10 minutes idle. Other users get an ephemeral "not yours" reply. State lives in the command's closure, so controls stop working after a restart. `/leaderboard` defaults to the 2 week loss window but the dropdown can change it.
- `/adminlink` re-exports `link.ts`'s `autocomplete` and reuses its `linkAccount`.

## Lines (`src/lines/`)

All bot text lives here: announcements, the rotating status, `/online` blurbs and @mention replies.

- Lines are template strings with placeholders filled by `fill(line, ctx, n)`: `{hero} {kills} {deaths} {assists} {kda} {souls} {name} {lasthits} {minutes} {rank} {losses} {losttime} {n}`. Activity and presence lines use their own fill helpers with extra fields like names and mode.
- `usable(ctx)` drops lines that need an optional value the context doesn't have, such as `{souls}` in Street Brawl or `{rank}` outside ranked. When you add a new optional placeholder, add it to `OPTIONAL` in `common.ts`.
- `fresh(pool, keep)` picks at random but avoids the last third of the pool's picks. `filtered()` re-rolls the third-party `insult` and `insult-compliment` packages past a word blocklist.
- `HERO_LINES` in `heroes.ts` is keyed by deadlock-api's exact hero name (`"Mo & Krill"`, `"The Doorman"`). A misspelled key is never used.
- A match line comes from one of these sources. The bot rolls a 15% chance of an insult or compliment from a package. Otherwise it rolls 40% for hero-specific lines, then 40% for situational ones (Street Brawl, a stomp under 20m, a long game over 45m), and falls back to the general win or loss pool.

## Bot status (`discord/presence.ts`)

The custom status rotates every `PRESENCE_ROTATE_MS`. It shows the highest activity tier anyone linked is in (match > queue > in Deadlock > other game > online), with parties grouped together. When nobody is online it alternates between roasting the latest match and an idle line. It also refreshes immediately when someone starts a match or queue. `DiscordStore.status` holds the text, and a watcher pushes it to Discord.

## Mentions and guard

- `@BotLocker` in the guild gets a line about the sender's last game (`discord/mentions.ts`, `lines/mention.ts`).
- `discord/guard.ts` DMs the owner once for each new Steam Guard request (see `tracking.md`).
