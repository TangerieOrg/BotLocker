import { watchAll } from "../helpers/store.ts";
import { guardWaiting, SteamStore } from "../steam/SteamStore.ts";
import { client } from "./client.ts";
import { DiscordStore } from "./DiscordStore.ts";
import { getOwnerId } from "./util.ts";

// Everything waiting on a code (a new login object every time Steam asks), once Discord is up to pass it on
function pendingGuards() {
    return DiscordStore.get().channel ? guardWaiting() : [];
}

const sameLogins = (a : ReturnType<typeof pendingGuards>, b : ReturnType<typeof pendingGuards>) =>
    a.length == b.length && a.every((x, i) => x.login === b[i].login);

// DMs the owner, the login waits until they send the code with /steamguard
export function startGuardNotice() {
    watchAll([SteamStore, DiscordStore], pendingGuards, async (waiting, prev) => {
        const asking = waiting.filter(x => !prev?.some(y => y.login === x.login));
        if(asking.length == 0) return;

        const ownerId = await getOwnerId(client);
        const owner = ownerId ? await client.users.fetch(ownerId).catch(() => undefined) : undefined;
        if(!owner) return console.error("[Steam] Couldn't find the bot owner to ask for a Steam Guard code");

        const guild = DiscordStore.get().channel!.guild.name;
        for(const { username, login } of asking) {
            const hint = waiting.length > 1 ? ` username:${username}` : "";
            await owner.send(`${login.lastCodeWrong ? "That Steam Guard code was wrong. " : ""}The Steam account \`${username}\` needs a Steam Guard code (${login.where}). Send it with \`/steamguard code:<code>${hint}\` in ${guild}`)
                .then(() => console.log(`[Steam] Asked ${owner.username} for the Steam Guard code for ${username}`))
                .catch(err => console.error(`[Steam] Couldn't DM ${owner.username} for the Steam Guard code`, err));
        }
    }, sameLogins);
}
