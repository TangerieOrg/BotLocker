import { watchAll } from "../helpers/store.ts";
import { SteamStore } from "../steam/SteamStore.ts";
import { client } from "./client.ts";
import { DiscordStore } from "./DiscordStore.ts";
import { getOwnerId } from "./util.ts";

// The guard login (a new object every time Steam asks), once Discord is up to pass it on
function pendingGuard() {
    const { login } = SteamStore.get();
    return login.state == "guard" && DiscordStore.get().channel ? login : undefined;
}

// DMs the owner, the login waits until they send the code with /steamguard
export function startGuardNotice() {
    watchAll([SteamStore, DiscordStore], pendingGuard, async login => {
        if(!login) return;

        const ownerId = await getOwnerId(client);
        const owner = ownerId ? await client.users.fetch(ownerId).catch(() => undefined) : undefined;
        if(!owner) return console.error("[Steam] Couldn't find the bot owner to ask for a Steam Guard code");

        const guild = DiscordStore.get().channel!.guild.name;
        await owner.send(`${login.lastCodeWrong ? "That Steam Guard code was wrong. " : ""}The Steam bot needs a Steam Guard code (${login.where}). Send it with \`/steamguard code:<code>\` in ${guild}`)
            .then(() => console.log(`[Steam] Asked ${owner.username} for the Steam Guard code`))
            .catch(err => console.error(`[Steam] Couldn't DM ${owner.username} for the Steam Guard code`, err));
    });
}
