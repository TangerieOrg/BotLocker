import { Client, Events, GatewayIntentBits } from "discord.js";
import { DEV_GUILD_ID, TOKEN } from "../config.ts";
import { ensureGuild, removeGuild } from "../db/mod.ts";
import { handleMention } from "../features/mentions.ts";
import { startPresence } from "../features/presence.ts";
import { startTracker } from "../features/tracker/mod.ts";
import { setIngestClient } from "../features/ingest.ts";
import { startSteam, steamEvents } from "../steam/client.ts";
import { getOwnerId } from "./util.ts";
import { commands, handleInteraction, loadCommands } from "./commands.ts";

// DMs the owner, the login waits until they send the code with /steamguard
async function notifyGuard(client : Client, where : string, lastCodeWrong : boolean) {
    const ownerId = await getOwnerId(client);
    const owner = ownerId ? await client.users.fetch(ownerId).catch(() => undefined) : undefined;
    if(!owner) return console.error("[Steam] Couldn't find the bot owner to ask for a Steam Guard code");

    await owner.send(`${lastCodeWrong ? "That Steam Guard code was wrong. " : ""}The Steam bot needs a Steam Guard code (${where}). Send it with \`/steamguard code:<code>\``)
        .then(() => console.log(`[Steam] Asked ${owner.username} for the Steam Guard code`))
        .catch(err => console.error(`[Steam] Couldn't DM ${owner.username} for the Steam Guard code`, err));
}

export async function startBot() {
    if(!TOKEN) {
        console.error("No DISCORD_TOKEN in .env");
        Deno.exit(1);
    }

    await loadCommands();

    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

    client.once(Events.ClientReady, async c => {
        console.log(`Logged in as ${c.user.tag}`);

        for(const guild of c.guilds.cache.values()) await ensureGuild(guild.id);

        const body = [...commands.values()].map(x => x.data.toJSON());
        if(DEV_GUILD_ID) await c.application.commands.set(body, DEV_GUILD_ID);
        else await c.application.commands.set(body);
        console.log(`Registered ${body.length} commands${DEV_GUILD_ID ? ` to ${DEV_GUILD_ID}` : ""}`);

        steamEvents.on("guardNeeded", (where : string, lastCodeWrong : boolean) => notifyGuard(c, where, lastCodeWrong));
        startSteam();
        startTracker(c);
        setIngestClient(c);
        startPresence(c);
    });

    client.on(Events.GuildCreate, async guild => {
        await ensureGuild(guild.id);
        console.log(`Joined ${guild.name}`);
    });

    client.on(Events.GuildDelete, async guild => {
        await removeGuild(guild.id);
        console.log(`Left ${guild.name}`);
    });

    client.on(Events.MessageCreate, msg => {
        handleMention(msg).catch(err => console.error(err));
    });

    client.on(Events.InteractionCreate, interaction => {
        handleInteraction(interaction).catch(err => console.error(err));
    });

    await client.login(TOKEN);
    return client;
}
