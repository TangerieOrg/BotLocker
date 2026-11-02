import { RESTJSONErrorCodes, type Guild } from "discord.js";
import { getDiscordNames, removeDiscordName, setDiscordName } from "../db/mod.ts";

// Last known server display names, loaded from SQLite on import. Reads use this, the sync in nameSync.ts and anything
// that happens to hold a live member keep it fresh
const names = new Map((await getDiscordNames()).map(x => [x.user_id, x.name]));

export function rememberName(userId : string, name : string) {
    if(names.get(userId) == name) return;
    names.set(userId, name);
    setDiscordName(userId, name).catch(err => console.error("[Names] Couldn't save a name", err));
}

export function forgetName(userId : string) {
    if(!names.delete(userId)) return;
    removeDiscordName(userId).catch(err => console.error("[Names] Couldn't remove a name", err));
}

// Looks the member up live and remembers them, a member who left the server is forgotten (anything else keeps the stored name)
export async function fetchName(guild : Guild, userId : string) {
    try {
        const member = await guild.members.fetch(userId);
        rememberName(userId, member.displayName);
        return member.displayName;
    } catch(err) {
        if((err as { code? : number }).code == RESTJSONErrorCodes.UnknownMember) forgetName(userId);
        return undefined;
    }
}

// Stored name first, only people the bot has never seen cost a request
export async function displayName(guild : Guild, userId : string) {
    return names.get(userId) ?? await fetchName(guild, userId);
}

// Anyone missing from the result isn't in the server (or couldn't be looked up and was never seen)
export async function displayNames(guild : Guild, userIds : string[]) {
    const out = new Map<string, string>();
    await Promise.all(userIds.map(async id => {
        const name = await displayName(guild, id);
        if(name) out.set(id, name);
    }));
    return out;
}
