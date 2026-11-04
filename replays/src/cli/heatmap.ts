import { parseArgs } from "@std/cli/parse-args";
import { BOT_DB, DEFAULT_MODE, findAccounts, findHero, loadNames, matchFilter, openSource, placeholders, playersLabel, REPLAYS_DB } from "./db.ts";
import { CLEAN_POSITIONS, cleanSpots, DEFAULT_ERA, findEra, loadMinimap } from "./maps.ts";
import { binExpr, clock, frameSvg, heatLayer, spotLayer } from "./render.ts";

const USAGE = `Heatmaps over the minimap from match metadata, written as SVG

deno task heatmap --account <id|name>[,<id|name>...] [--kind presence|deaths|kills] [--era 4lane|3lane|ognb|cns] [--mode standard|ranked|unranked|brawl]
    [--hero <id|name>] [--days N] [--out file.svg]

presence  where they spend time alive (1 sample a second)
deaths    where they died
kills     where they were standing when they got a kill

Several accounts are pooled into one map. --era defaults to ${DEFAULT_ERA} (the current map) and --mode to ${DEFAULT_MODE}`;

const args = parseArgs(Deno.args, {
    string: ["account", "kind", "era", "hero", "mode", "out", "db", "bot"],
    boolean: ["help"],
    default: { kind: "presence" },
    alias: { h: "help", a: "account", k: "kind", d: "days", o: "out" }
});
if(args.help || !args.account) {
    console.log(USAGE);
    Deno.exit(args.help ? 0 : 1);
}

const BINS = 128;

const db = await openSource(args.db ?? REPLAYS_DB);
const bot = await openSource(args.bot ?? BOT_DB);
const names = await loadNames(bot);
bot.close();

const accounts = findAccounts(names, args.account);
const hero = args.hero ? findHero(names, args.hero) : undefined;
const name = playersLabel(names, accounts);
const mine = `p.account_id IN (${placeholders(accounts)})`;
const eraName = args.era ?? DEFAULT_ERA;
const era = findEra(eraName);
const minimap = await loadMinimap(eraName, era);

const range = { days: args.days ? Number(args.days) : undefined, mode: args.mode, era };
const heroWhere = hero === undefined ? [] : ["p.hero_id = ?"];
const heroParams = hero === undefined ? [] : [hero];

let body = "";
let count = 0;
let unit = "";

if(args.kind == "presence") {
    // Binned in SQL, a few hundred matches is millions of samples
    const filter = matchFilter(range, "m");
    const { bx, by } = binExpr(BINS);
    const bins = await db.all<{ bx : number, by : number, n : number }>(`--sql
        SELECT ${bx} AS bx, ${by} AS by, COUNT(*) AS n
        FROM players p
        JOIN matches m ON m.match_id = p.match_id
        JOIN positions s ON s.match_id = p.match_id AND s.slot = p.slot
        WHERE ${[mine, CLEAN_POSITIONS, ...heroWhere, ...filter.where].join(" AND ")}
        GROUP BY bx, by
    `, ...accounts, ...heroParams, ...filter.params);

    // Log scale, otherwise spawn and lane dominate and everything else is invisible
    const max = Math.log1p(Math.max(1, ...bins.map(x => x.n)));
    body = heatLayer(era, BINS, bins.map(b => ({ bx: b.bx, by: b.by, v: Math.log1p(b.n) / max })),
        b => `${Math.round((bins.find(x => x.bx == b.bx && x.by == b.by)?.n ?? 0) / 60)} min`);
    count = (await db.all<{ n : number }>(`--sql
        SELECT COUNT(*) AS n FROM players p JOIN matches m ON m.match_id = p.match_id WHERE ${[mine, ...heroWhere, ...filter.where].join(" AND ")}
    `, ...accounts, ...heroParams, ...filter.params))[0].n;
    unit = "matches";
} else if(args.kind == "deaths" || args.kind == "kills") {
    const kills = args.kind == "kills";
    const filter = matchFilter(range, "d");
    // For kills the hero filter is on the killer, which is who the map is about
    const where = [`${kills ? "d.killer_account_id" : "d.account_id"} IN (${placeholders(accounts)})`, kills ? cleanSpots("d.killer_x", "d.killer_y") : cleanSpots("d.x", "d.y"),
        ...(hero === undefined ? [] : [kills ? "d.killer_hero_id = ?" : "d.hero_id = ?"]), ...filter.where];
    const spots = await db.all<{ x : number, y : number, t : number, match_id : number, me : number, other : number | null }>(`--sql
        SELECT ${kills ? "d.killer_x AS x, d.killer_y AS y, d.killer_account_id AS me, d.account_id AS other" : "d.x, d.y, d.account_id AS me, d.killer_account_id AS other"},
            d.t, d.match_id
        FROM death_spots d WHERE ${where.join(" AND ")}
    `, ...accounts, ...heroParams, ...filter.params);

    const who = (id : number | null) => id === null ? "not a player" : names.linked.get(id) ?? `account ${id}`;
    body = spotLayer(era, kills ? "kill" : "death", spots.map(s => ({
        x: s.x,
        y: s.y,
        title: `${s.match_id} at ${clock(s.t)}, ${accounts.length > 1 ? `${who(s.me)} ` : ""}${kills ? "killed" : "killed by"} ${who(s.other)}`
    })));
    count = spots.length;
    unit = args.kind;
} else {
    console.log(USAGE);
    Deno.exit(1);
}

db.close();

const title = [
    `${name}: ${args.kind}`,
    hero === undefined ? "" : names.heroes.get(hero) ?? `hero ${hero}`,
    args.mode ?? DEFAULT_MODE,
    args.days ? `last ${args.days} days` : "",
    `${count} ${unit}`
].filter(x => x).join(" · ");

const legend = [{ kind: args.kind == "presence" ? "heat" : args.kind == "deaths" ? "death" : "kill", text: {
    presence: "Time spent alive",
    deaths: "Where they died",
    kills: "Where they stood for a kill"
}[args.kind as "presence" | "deaths" | "kills"] }] as const;
const svg = frameSvg({ title, subtitle: [era.label, era.note].filter(x => x).join(" · "), minimap, body, legend: [...legend] });
const out = args.out ?? `out/${name.replace(/[^\w-]+/g, "_")}-${args.kind}-${eraName}${args.mode && args.mode != DEFAULT_MODE ? `-${args.mode}` : ""}${hero === undefined ? "" : `-${hero}`}.svg`;
await Deno.mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await Deno.writeTextFile(out, svg);
console.log(`Wrote ${out} (${title})`);
