import { parseArgs } from "@std/cli/parse-args";
import { encodeBase64 } from "@std/encoding/base64";
import { BOT_DB, findAccount, findHero, loadNames, matchFilter, openSource, REPLAYS_DB } from "./db.ts";

const USAGE = `Heatmaps over the minimap from match metadata, written as SVG

deno task heatmap --account <id|name> [--kind presence|deaths|kills] [--hero <id|name>] [--days N] [--mode unranked|ranked|brawl] [--out file.svg]

presence  where they spend time alive (1 sample a second)
deaths    where they died
kills     where they were standing when they got a kill`;

const args = parseArgs(Deno.args, {
    string: ["account", "kind", "hero", "mode", "out", "db", "bot"],
    boolean: ["help"],
    default: { kind: "presence" },
    alias: { h: "help", a: "account", k: "kind", d: "days", o: "out" }
});
if(args.help || !args.account) {
    console.log(USAGE);
    Deno.exit(args.help ? 0 : 1);
}

const ASSETS_URL = "https://api.deadlock-api.com/v1/assets/map";
const SIZE = 1024;
const BINS = 128;
// Blue sequential ramp, darkest for the least time so the busy spots stand out against the grey map
const RAMP = ["#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];
const DOT = "#eb6834";

const db = await openSource(args.db ?? REPLAYS_DB);
const bot = await openSource(args.bot ?? BOT_DB);
const names = await loadNames(bot);
bot.close();

const account = findAccount(names, args.account);
const hero = args.hero ? findHero(names, args.hero) : undefined;
const name = names.linked.get(account) ?? String(account);

const map = await (await fetch(ASSETS_URL)).json() as { radius : number, images : { minimap : string } };
const r = map.radius;
const png = encodeBase64(new Uint8Array(await (await fetch(map.images.minimap)).arrayBuffer()));
// World units are centred on the map with y pointing up, the image is a square of side 2r
const px = (x : number) => (x + r) / (2 * r) * SIZE;
const py = (y : number) => (r - y) / (2 * r) * SIZE;

const range = { days: args.days ? Number(args.days) : undefined, mode: args.mode };
const heroWhere = hero === undefined ? [] : ["p.hero_id = ?"];
const heroParams = hero === undefined ? [] : [hero];

let marks = "";
let count = 0;
let unit = "";

if(args.kind == "presence") {
    // Binned in SQL, a few hundred matches is millions of samples
    const filter = matchFilter(range, "m");
    const where = ["p.account_id = ?", "s.health > 0", ...heroWhere, ...filter.where];
    const bins = await db.all<{ bx : number, by : number, n : number }>(`--sql
        SELECT CAST((s.x + ?) * ? / (2.0 * ?) AS INTEGER) AS bx, CAST((? - s.y) * ? / (2.0 * ?) AS INTEGER) AS by, COUNT(*) AS n
        FROM players p
        JOIN matches m ON m.match_id = p.match_id
        JOIN positions s ON s.match_id = p.match_id AND s.slot = p.slot
        WHERE ${where.join(" AND ")}
        GROUP BY bx, by
    `, r, BINS, r, r, BINS, r, account, ...heroParams, ...filter.params);

    // Log scale, otherwise spawn and lane dominate and everything else is invisible
    const max = Math.log1p(Math.max(1, ...bins.map(x => x.n)));
    const cell = SIZE / BINS;
    marks = bins.map(b => {
        const v = Math.log1p(b.n) / max;
        const colour = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
        return `<rect x="${(b.bx * cell).toFixed(1)}" y="${(b.by * cell).toFixed(1)}" width="${cell}" height="${cell}" fill="${colour}" fill-opacity="${(0.25 + 0.6 * v).toFixed(2)}"><title>${Math.round(b.n / 60)} min</title></rect>`;
    }).join("\n");
    count = (await db.all<{ n : number }>(`--sql
        SELECT COUNT(*) AS n FROM players p JOIN matches m ON m.match_id = p.match_id WHERE ${["p.account_id = ?", ...heroWhere, ...filter.where].join(" AND ")}
    `, account, ...heroParams, ...filter.params))[0].n;
    unit = "matches";
} else if(args.kind == "deaths" || args.kind == "kills") {
    const kills = args.kind == "kills";
    const filter = matchFilter(range, "d");
    // For kills the hero filter is on the killer, which is who the map is about
    const where = [kills ? "d.killer_account_id = ?" : "d.account_id = ?", "d.x IS NOT NULL",
        ...(hero === undefined ? [] : [kills ? "d.killer_hero_id = ?" : "d.hero_id = ?"]), ...filter.where];
    const spots = await db.all<{ x : number, y : number, t : number, match_id : number, other : number | null }>(`--sql
        SELECT ${kills ? "d.killer_x AS x, d.killer_y AS y, d.account_id AS other" : "d.x, d.y, d.killer_account_id AS other"}, d.t, d.match_id
        FROM death_spots d WHERE ${where.join(" AND ")}
    `, account, ...heroParams, ...filter.params);

    const who = (id : number | null) => id === null ? "not a player" : names.linked.get(id) ?? `account ${id}`;
    const clock = (t : number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    marks = spots.map(s => `<circle cx="${px(s.x).toFixed(1)}" cy="${py(s.y).toFixed(1)}" r="4" fill="${DOT}" fill-opacity="0.7" stroke="#1d1d1b" stroke-width="1"><title>${s.match_id} at ${clock(s.t)}, ${kills ? "killed" : "killed by"} ${who(s.other)}</title></circle>`).join("\n");
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
    args.mode ?? "",
    args.days ? `last ${args.days} days` : "all time",
    `${count} ${unit}`
].filter(x => x).join(" · ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE + 40}" width="${SIZE}" height="${SIZE + 40}">
<rect width="100%" height="100%" fill="#1d1d1b"/>
<text x="16" y="27" font-family="system-ui, sans-serif" font-size="18" fill="#f0efec">${title}</text>
<g transform="translate(0 40)">
<!-- Buildings are transparent in the minimap, this is what shows through -->
<rect width="${SIZE}" height="${SIZE}" fill="#6b6b66"/>
<image href="data:image/png;base64,${png}" width="${SIZE}" height="${SIZE}"/>
${marks}
</g>
</svg>
`;

const out = args.out ?? `out/${name.replace(/[^\w-]+/g, "_")}-${args.kind}${hero === undefined ? "" : `-${hero}`}.svg`;
await Deno.mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await Deno.writeTextFile(out, svg);
console.log(`Wrote ${out} (${title})`);
