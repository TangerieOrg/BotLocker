// deno task steam-test <account_id>
// Logs the Steam bot in and runs each game coordinator request once, the account must be friends with the bot for history
import { getRefreshToken, startSteam, steamReady } from "../src/steam/client.ts";
import { getGcHistory, getGcRank, getGcSalts, metadataRemaining } from "../src/steam/gc.ts";
import { getValveMatch } from "../src/deadlock/valve.ts";

const accountId = Number(Deno.args[0]);
if(!accountId) {
    console.error("Usage: deno task steam-test <account_id>");
    Deno.exit(1);
}

if(!startSteam()) Deno.exit(1);

// Long enough to type in a Steam Guard code
for(let i = 0; !steamReady(); i++) {
    if(i > 300) {
        console.error("Never connected to the game coordinator");
        Deno.exit(1);
    }
    await new Promise(res => setTimeout(res, 1000));
}

console.log(`\nRefresh token (STEAM_BOT_REFRESH_TOKEN for the server): ${await getRefreshToken() ?? "not saved yet"}`);

const step = async <T>(name : string, fn : () => Promise<T>) => {
    try {
        const r = await fn();
        console.log(`\n== ${name}`, r);
        return r;
    } catch(err) {
        console.error(`\n== ${name} failed`, err);
        return undefined;
    }
};

const history = await step("History (first 3)", () => getGcHistory(accountId).then(x => ({ ...x, matches: x.matches.slice(0, 3) })));
await step("Rank", () => getGcRank(accountId));

const latest = history?.matches.at(0);
if(latest) {
    console.log(`\n${await metadataRemaining()} metadata request(s) left today`);
    const salts = await step(`Salts for ${latest.match_id}`, () => getGcSalts(latest.match_id));
    if(salts) {
        await step("Match file", () => getValveMatch(salts.match_id, salts.cluster_id, salts.metadata_salt).then(x => ({ ...x.match_info, players: x.match_info.players.length })));
    }
}

Deno.exit(0);
