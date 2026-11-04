import { parseArgs } from "@std/cli/parse-args";
import { BOT_DB, DEFAULT_MODE, findAccounts, findHero, loadNames, matchFilter, openSource, placeholders, playersLabel, REPLAYS_DB } from "./db.ts";
import { CLEAN_POSITIONS, cleanSpots, DEFAULT_ERA, findEra, loadMinimap } from "./maps.ts";
import { binExpr, clock, frameSvg, heatLayer, type LegendItem, type Spot, spotLayer } from "./render.ts";

const USAGE = `Animated heatmap over the game clock, averaged over a player's matches. Writes an MP4, needs ffmpeg and rsvg-convert

deno task animate --account <id|name>[,<id|name>...] [--heat presence|souls|none] [--dots deaths,kills|none] [--era 4lane|3lane|ognb|cns]
    [--mode standard|ranked|unranked|brawl] [--hero <id|name>] [--days N] [--speed 60] [--out file.mp4]

presence  where they spend time alive
souls     where they earn souls. Estimated: the metadata only has soul totals every 3-5 minutes, so each
          snapshot's souls are spread over where they stood since the last one
deaths    dots where they died, kills dots where they stood for a kill. Each fades in and out over its 3 minute window

Several accounts are pooled: their matches are averaged together as one set.
Every frame shows the 3 minutes around its clock time, divided by the matches still going then.
It stops once fewer than 10% of the matches are still going. --speed is game seconds per second of video.
--era defaults to ${DEFAULT_ERA} (the current map) and --mode to ${DEFAULT_MODE}`;

const args = parseArgs(Deno.args, {
    string: ["account", "heat", "dots", "era", "hero", "mode", "out", "db", "bot"],
    boolean: ["help"],
    default: { heat: "presence", dots: "deaths,kills", speed: 60 },
    alias: { h: "help", a: "account", d: "days", o: "out" }
});
if(args.help || !args.account) {
    console.log(USAGE);
    Deno.exit(args.help ? 0 : 1);
}

const BINS = 96;
const FPS = 12;
// Heat is pulled in 30 second buckets, frames blend the buckets their window overlaps
const BUCKET_S = 30;
const WINDOW_S = 180;
const MIN_RUNNING = 0.1;

const heat = args.heat;
if(!["presence", "souls", "none"].includes(heat)) throw new Error("--heat is presence, souls or none");
const dots = args.dots == "none" ? [] : args.dots.split(",").map(x => x.trim());
if(dots.some(x => x != "deaths" && x != "kills")) throw new Error("--dots is deaths, kills, both or none");
const speed = Number(args.speed);

for(const bin of ["ffmpeg", "rsvg-convert"]) {
    const ok = await new Deno.Command(bin, { args: ["-version"], stdout: "null", stderr: "null" }).output().then(x => x.success, () => false);
    if(!ok) throw new Error(`${bin} isn't installed`);
}

const db = await openSource(args.db ?? REPLAYS_DB);
const bot = await openSource(args.bot ?? BOT_DB);
const names = await loadNames(bot);
bot.close();

const accounts = findAccounts(names, args.account);
const hero = args.hero ? findHero(names, args.hero) : undefined;
const name = playersLabel(names, accounts);
const eraName = args.era ?? DEFAULT_ERA;
const era = findEra(eraName);
const minimap = await loadMinimap(eraName, era);

const range = { days: args.days ? Number(args.days) : undefined, mode: args.mode, era };
const filter = matchFilter(range, "m");
const mine = [`p.account_id IN (${placeholders(accounts)})`, ...(hero === undefined ? [] : ["p.hero_id = ?"]), ...filter.where];
const mineParams = [...accounts, ...(hero === undefined ? [] : [hero]), ...filter.params];

const matches = await db.all<{ duration_s : number }>(`--sql
    SELECT m.duration_s FROM players p JOIN matches m ON m.match_id = p.match_id WHERE ${mine.join(" AND ")}
`, ...mineParams);
if(matches.length == 0) throw new Error("No matches for that player, era and mode");

const durations = matches.map(x => x.duration_s).sort((a, b) => a - b);
// Matches still going at game time t. A match two of the accounts were in counts once for each
const running = (t : number) => {
    let lo = 0;
    let hi = durations.length;
    while(lo < hi) {
        const mid = (lo + hi) >> 1;
        if(durations[mid] < t) lo = mid + 1;
        else hi = mid;
    }
    return durations.length - lo;
};
const end = durations[Math.floor(durations.length * (1 - MIN_RUNNING))];

console.log(`${matches.length} matches, animating to ${clock(end)}`);

// bucket -> bin key -> amount, summed over matches
const buckets = new Map<number, Map<number, number>>();
const { bx, by } = binExpr(BINS);

if(heat == "presence") {
    const rows = await db.all<{ bx : number, by : number, tb : number, v : number }>(`--sql
        SELECT ${bx} AS bx, ${by} AS by, s.t / ${BUCKET_S} AS tb, COUNT(*) AS v
        FROM players p
        JOIN matches m ON m.match_id = p.match_id
        JOIN positions s ON s.match_id = p.match_id AND s.slot = p.slot
        WHERE ${[...mine, CLEAN_POSITIONS].join(" AND ")}
        GROUP BY bx, by, tb
    `, ...mineParams);
    for(const r of rows) addBucket(r.tb, r.bx * BINS + r.by, r.v);
} else if(heat == "souls") {
    // Souls gained between snapshots, spread evenly over the alive samples in that stretch
    const rows = await db.all<{ bx : number, by : number, tb : number, v : number }>(`--sql
        WITH mine AS (
            SELECT p.match_id, p.slot FROM players p JOIN matches m ON m.match_id = p.match_id WHERE ${mine.join(" AND ")}
        ), raw AS (
            SELECT st.match_id, st.slot, st.t AS t1, LAG(st.t, 1, 0) OVER w AS t0, st.net_worth - LAG(st.net_worth, 1, 0) OVER w AS gained
            FROM stats st JOIN mine ON mine.match_id = st.match_id AND mine.slot = st.slot
            WINDOW w AS (PARTITION BY st.match_id, st.slot ORDER BY st.t)
        ), samples AS (
            SELECT s.x, s.y, s.t, MAX(r.gained, 0) AS gained, COUNT(*) OVER (PARTITION BY s.match_id, s.slot, r.t1) AS k
            FROM raw r JOIN positions s ON s.match_id = r.match_id AND s.slot = r.slot AND s.t > r.t0 AND s.t <= r.t1
            WHERE ${CLEAN_POSITIONS}
        )
        SELECT ${bx} AS bx, ${by} AS by, s.t / ${BUCKET_S} AS tb, SUM(s.gained * 1.0 / s.k) AS v
        FROM samples s
        GROUP BY bx, by, tb
    `, ...mineParams);
    for(const r of rows) addBucket(r.tb, r.bx * BINS + r.by, r.v);
}

function addBucket(tb : number, key : number, v : number) {
    let bucket = buckets.get(tb);
    if(!bucket) buckets.set(tb, bucket = new Map());
    bucket.set(key, (bucket.get(key) ?? 0) + v);
}

interface Event { t : number, x : number, y : number }

const events : Record<"deaths" | "kills", Event[]> = { deaths: [], kills: [] };
const spotFilter = matchFilter(range, "d");
for(const kind of dots as ("deaths" | "kills")[]) {
    const kills = kind == "kills";
    const where = [`${kills ? "d.killer_account_id" : "d.account_id"} IN (${placeholders(accounts)})`, kills ? cleanSpots("d.killer_x", "d.killer_y") : cleanSpots("d.x", "d.y"),
        ...(hero === undefined ? [] : [kills ? "d.killer_hero_id = ?" : "d.hero_id = ?"]), ...spotFilter.where];
    events[kind] = await db.all<Event>(`--sql
        SELECT d.t, ${kills ? "d.killer_x AS x, d.killer_y AS y" : "d.x, d.y"} FROM death_spots d WHERE ${where.join(" AND ")}
    `, ...accounts, ...(hero === undefined ? [] : [hero]), ...spotFilter.params);
}

db.close();

// Per match average of everything in the window around t, each bucket divided by the matches going at its midpoint
function heatAt(t : number) {
    const out = new Map<number, number>();
    const from = t - WINDOW_S / 2;
    const to = t + WINDOW_S / 2;
    for(let tb = Math.max(0, Math.floor(from / BUCKET_S)); tb * BUCKET_S < to; tb++) {
        const bucket = buckets.get(tb);
        const n = running(tb * BUCKET_S + BUCKET_S / 2);
        if(!bucket || n == 0) continue;
        const overlap = (Math.min(to, (tb + 1) * BUCKET_S) - Math.max(from, tb * BUCKET_S)) / BUCKET_S;
        for(const [key, v] of bucket) out.set(key, (out.get(key) ?? 0) + v * overlap / n);
    }
    return out;
}

const step = speed / FPS;
const times : number[] = [];
for(let t = 0; t <= end; t += step) times.push(t);

const fields = times.map(heatAt);
// One scale for the whole video so brighter always means more. The top 1% clips, otherwise everyone standing in base at 0:00
// sets the scale and the rest of the match is dim. Square root so the quieter spots still show
const values = fields.flatMap(f => [...f.values()]).sort((a, b) => a - b);
const max = Math.max(1e-9, values[Math.floor(values.length * 0.99)] ?? 0);

const perMatch = (list : Event[], t : number) => list.reduce((sum, e) => Math.abs(e.t - t) <= WINDOW_S / 2 ? sum + 1 / Math.max(1, running(e.t)) : sum, 0);
const fadeSpots = (list : Event[], t : number) : Spot[] => list.flatMap(e => {
    const dt = Math.abs(e.t - t);
    return dt <= WINDOW_S / 2 ? [{ x: e.x, y: e.y, opacity: 1 - dt / (WINDOW_S / 2) }] : [];
});

const title = [
    `${name}: ${[heat == "none" ? "" : heat, ...dots].filter(x => x).join(", ")}`,
    hero === undefined ? "" : names.heroes.get(hero) ?? `hero ${hero}`,
    args.mode ?? DEFAULT_MODE,
    args.days ? `last ${args.days} days` : "",
    `${matches.length} matches`
].filter(x => x).join(" · ");
const subtitle = [era.label, era.note, heat == "souls" ? "souls are estimated from position" : ""].filter(x => x).join(" · ");

function frame(i : number) {
    const t = times[i];
    const body = heatLayer(era, BINS, [...fields[i]].map(([key, v]) => ({ bx: Math.floor(key / BINS), by: key % BINS, v: Math.sqrt(v / max) })))
        + (events.deaths.length ? spotLayer(era, "death", fadeSpots(events.deaths, t)) : "")
        + (events.kills.length ? spotLayer(era, "kill", fadeSpots(events.kills, t)) : "");
    const legend : LegendItem[] = [];
    if(heat == "presence") legend.push({ kind: "heat", text: "Time spent alive" });
    if(heat == "souls") legend.push({ kind: "heat", text: "Souls earned (estimate)" });
    if(dots.includes("deaths")) legend.push({ kind: "death", text: `Deaths, ${perMatch(events.deaths, t).toFixed(2)} a match in these 3 min` });
    if(dots.includes("kills")) legend.push({ kind: "kill", text: `Kills, ${perMatch(events.kills, t).toFixed(2)} a match in these 3 min` });
    return frameSvg({ title, subtitle, minimap, body, legend, clock: clock(t) });
}

async function rasterise(svg : string) {
    const child = new Deno.Command("rsvg-convert", { args: ["-f", "png"], stdin: "piped", stdout: "piped" }).spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(svg));
    await writer.close();
    const out = await child.output();
    if(!out.success) throw new Error("rsvg-convert failed");
    return out.stdout;
}

const out = args.out ?? `out/${name.replace(/[^\w-]+/g, "_")}-${[heat, ...dots].join("-")}-${eraName}${args.mode && args.mode != DEFAULT_MODE ? `-${args.mode}` : ""}${hero === undefined ? "" : `-${hero}`}.mp4`;
await Deno.mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });

const ffmpeg = new Deno.Command("ffmpeg", {
    args: ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-movflags", "+faststart", out],
    stdin: "piped"
}).spawn();
const video = ffmpeg.stdin.getWriter();

// Rasterising is the slow part, a few at a time but written to ffmpeg in order
const parallel = Math.max(1, Math.floor(navigator.hardwareConcurrency / 2));
const started = Date.now();
for(let i = 0; i < times.length; i += parallel) {
    const pngs = await Promise.all(times.slice(i, i + parallel).map((_, j) => rasterise(frame(i + j))));
    for(const png of pngs) await video.write(png);
    Deno.stdout.writeSync(new TextEncoder().encode(`\r${Math.min(i + parallel, times.length)}/${times.length} frames`));
}
await video.close();
if(!(await ffmpeg.status).success) throw new Error("ffmpeg failed");
console.log(`\nWrote ${out} (${title}) in ${Math.round((Date.now() - started) / 1000)}s`);
