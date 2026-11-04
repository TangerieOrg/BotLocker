import { parseArgs } from "@std/cli/parse-args";
import { BOT_DB, findAccount, loadNames, matchFilter, openSource, REPLAYS_DB } from "./db.ts";

const USAGE = `Time spent dead from match metadata

deno task dead [--account <id|name>] [--days N] [--mode standard|ranked|unranked|brawl] [--db url|path] [--bot url|path]

--mode defaults to standard (normal matches, ranked or not), Street Brawl is only included with --mode brawl.
Without --account, one line per linked player. With it, a per hero breakdown and the last 15 matches`;

const args = parseArgs(Deno.args, { string: ["account", "mode", "db", "bot"], boolean: ["help"], alias: { h: "help", a: "account", d: "days" } });
if(args.help) {
    console.log(USAGE);
    Deno.exit(0);
}

const db = await openSource(args.db ?? REPLAYS_DB);
const bot = await openSource(args.bot ?? BOT_DB);
const names = await loadNames(bot);
bot.close();

const filter = matchFilter({ days: args.days ? Number(args.days) : undefined, mode: args.mode }, "t");
const minutes = (s : number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

interface Summary { key : number, matches : number, avg_pct : number, avg_dead_s : number, avg_deaths : number, longest_s : number, worst_pct : number }

// Keyed by name so console.table uses it as the row label
const summarise = (rows : Summary[], label : (key : number) => string) => Object.fromEntries(rows.map(x => [label(x.key), {
    matches: x.matches,
    "dead %": x.avg_pct,
    "dead / match": minutes(x.avg_dead_s),
    "deaths / match": x.avg_deaths,
    "worst %": x.worst_pct,
    "longest death": `${x.longest_s}s`
}]));

const SUMMARY = `--sql
    COUNT(*) AS matches, ROUND(AVG(t.dead_pct), 1) AS avg_pct, AVG(t.dead_s) AS avg_dead_s,
    ROUND(AVG(t.deaths), 1) AS avg_deaths, MAX(t.longest_s) AS longest_s, MAX(t.dead_pct) AS worst_pct
`;

if(!args.account) {
    const ids = [...names.linked.keys()];
    const where = [`t.account_id IN (${ids.map(() => "?").join(", ")})`, ...filter.where];
    const rows = await db.all<Summary>(`--sql
        SELECT t.account_id AS key, ${SUMMARY} FROM time_dead t WHERE ${where.join(" AND ")} GROUP BY t.account_id ORDER BY avg_pct DESC
    `, ...ids, ...filter.params);
    console.table(summarise(rows, id => names.linked.get(id) ?? String(id)));
} else {
    const account = findAccount(names, args.account);
    const where = ["t.account_id = ?", ...filter.where];
    const params = [account, ...filter.params];
    console.log(names.linked.get(account) ?? account);

    const heroes = await db.all<Summary>(`--sql
        SELECT t.hero_id AS key, ${SUMMARY} FROM time_dead t WHERE ${where.join(" AND ")} GROUP BY t.hero_id ORDER BY matches DESC
    `, ...params);
    console.table(summarise(heroes, id => names.heroes.get(id) ?? `Hero ${id}`));

    const recent = await db.all<{ match_id : number, start_time : number, hero_id : number, won : number, deaths : number, dead_s : number, dead_pct : number, duration_s : number }>(`--sql
        SELECT t.* FROM time_dead t WHERE ${where.join(" AND ")} ORDER BY t.start_time DESC LIMIT 15
    `, ...params);
    console.table(recent.map(x => ({
        match: x.match_id,
        when: new Date(x.start_time * 1000).toLocaleString(),
        hero: names.heroes.get(x.hero_id) ?? x.hero_id,
        result: x.won ? "W" : "L",
        deaths: x.deaths,
        dead: `${minutes(x.dead_s)} of ${minutes(x.duration_s)}`,
        "dead %": x.dead_pct
    })));
}

db.close();
