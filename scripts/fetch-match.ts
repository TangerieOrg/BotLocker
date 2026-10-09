// deno task fetch-match <match_id> <cluster> <salt> [--server url]
// Sends one salt to a running bot, which fetches it from Valve, stores and announces it
import { parseArgs } from "@std/cli/parse-args";

const args = parseArgs(Deno.args, { string: ["server"] });
const [matchId, cluster, salt] = args._.map(Number);

if(!matchId || !cluster || !salt) {
    console.error("Usage: deno task fetch-match <match_id> <cluster> <salt> [--server url]");
    Deno.exit(1);
}

const server = args.server ?? `http://localhost:${Deno.env.get("PORT") ?? 3030}`;

const res = await fetch(`${server}/ingest/salts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ match_id: matchId, cluster_id: cluster, metadata_salt: salt }])
});
console.log(res.status, await res.text());

// Ingest runs in the background, give it a moment then show how it went
for(let i = 0; i < 10; i++) {
    await new Promise(res => setTimeout(res, 1000));
    const status = await fetch(`${server}/ingest/salts/${matchId}`);
    if(status.ok) {
        console.log(await status.json());
        break;
    }
    await status.body?.cancel();
}
