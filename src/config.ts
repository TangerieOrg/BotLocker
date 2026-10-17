import "./env.ts";

const getBool = (name : string) => {
    const v = Deno.env.get(name);
    if(v === "1") return true;
    if(v === "0") return false;
    return undefined;
}

const getNumber = (name : string) => {
    const v = Deno.env.get(name);
    return v ? Number(v) : undefined;
}

export const TOKEN = Deno.env.get("DISCORD_TOKEN");
// The one channel wins and losses get announced in, commands are registered to its server
export const CHANNEL_ID = Deno.env.get("CHANNEL_ID");
export const OWNER_ID = Deno.env.get("OWNER_ID");
export const SEND_DISCORD_MESSAGE = getBool("SEND_DISCORD_MESSAGE") ?? true;

export const DATA_DIR = Deno.env.get("DATA_DIR") ?? "./data";

// First account is the main bot (friends, presence, history), the rest only fetch match salts
export const STEAM_USERS = (Deno.env.get("STEAM_USERS") ?? "").split(",").flatMap(part => {
    const i = part.indexOf("|");
    const username = part.slice(0, i).trim();
    const password = part.slice(i + 1).trim();
    return i < 0 || !username || !password ? [] : [{ username, password }];
});

// Matches are normally picked up as soon as a friend stops playing, this is just a backstop
export const GC_POLL_INTERVAL_MS = getNumber("GC_POLL_INTERVAL_MS") ?? 60 * 60 * 1000;
export const MAX_NOTIFY_AGE_S = (getNumber("MAX_NOTIFY_AGE_H") ?? 6) * 60 * 60;
export const PRESENCE_ROTATE_MS = getNumber("PRESENCE_ROTATE_MS") ?? 180000;

// Salts are fetched from the game coordinator and shared with deadlock-api. Off still lets the read-only deadlock-api checks run
export const SALT_UPLOAD = getBool("SALT_UPLOAD") ?? true;
// Wait this long after a match ends so deadlock-api's own ingest gets there first, the game coordinator's salt limit is tight
export const SALT_DELAY_S = (getNumber("SALT_DELAY_MS") ?? 30 * 60 * 1000) / 1000;
export const SALT_FETCH_INTERVAL_MS = getNumber("SALT_FETCH_INTERVAL_MS") ?? 30 * 60 * 1000;
export const SALT_FETCH_DAILY_CAP = getNumber("SALT_FETCH_DAILY_CAP") ?? 40;
