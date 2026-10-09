import type { LossTotals, Match } from "../db/mod.ts";

export interface LineContext {
    hero: string;
    kills: number;
    deaths: number;
    assists: number;
    souls?: number;
    name?: string;
    lastHits?: number;
    minutes?: number;
    mode?: number;
    rank?: string;
    // Since the guild's last /resetrecord
    losses?: number;
    lostSeconds?: number;
}

// Everything the lines can use from a stored match. Rank needs a lookup so callers pass it in, and only for ranked games
export const matchContext = (match : Match, hero : string, rank? : string) : LineContext => ({
    hero,
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    souls: match.game_mode == 4 ? undefined : match.net_worth,
    lastHits: match.last_hits,
    minutes: Math.round(match.duration_s / 60),
    mode: match.game_mode,
    rank
});

// Left unset with no losses so lines about time spent losing get skipped
export const lossContext = (totals : LossTotals) => ({
    losses: totals.losses || undefined,
    lostSeconds: totals.time_lost || undefined
});

const BLOCKED = /\b(women|toilet|kiss|bed|hot|nickel)\b/i;

export const pick = <T,>(xs : T[]) => xs[Math.floor(Math.random() * xs.length)];

// Placeholders that aren't always known (no souls in Street Brawl, no rank outside ranked etc.)
const OPTIONAL : [string, (ctx : LineContext) => unknown][] = [
    ["{souls}", ctx => ctx.souls],
    ["{name}", ctx => ctx.name],
    ["{lasthits}", ctx => ctx.lastHits],
    ["{minutes}", ctx => ctx.minutes],
    ["{rank}", ctx => ctx.rank],
    // Lines say "{losses} losses", so not for just the one
    ["{losses}", ctx => (ctx.losses ?? 0) > 1 ? ctx.losses : undefined],
    ["{losttime}", ctx => ctx.lostSeconds]
];

// Skip lines that need something this match doesn't have
export const usable = (ctx : LineContext) => (line : string) => OPTIONAL.every(([token, get]) => !line.includes(token) || get(ctx) != null);

const recent = new WeakMap<string[], string[]>();

// Random pick that avoids the last third of what this pool has said, so the same line doesn't come up twice in a row
export function fresh(pool : string[], keep : (line : string) => boolean = () => true) {
    const lines = pool.filter(keep);
    const seen = recent.get(pool) ?? [];
    const unseen = lines.filter(x => !seen.includes(x));
    const line = pick(unseen.length > 0 ? unseen : lines);
    recent.set(pool, [...seen, line].slice(-Math.max(1, Math.floor(pool.length / 3))));
    return line;
}

export const formatKda = (ctx : LineContext) => ((ctx.kills + ctx.assists) / Math.max(ctx.deaths, 1)).toFixed(1);

export function fill(line : string, ctx : LineContext, n? : number) {
    return line
        .replaceAll("{hero}", ctx.hero)
        .replaceAll("{kills}", ctx.kills.toString())
        .replaceAll("{deaths}", ctx.deaths.toString())
        .replaceAll("{assists}", ctx.assists.toString())
        .replaceAll("{kda}", formatKda(ctx))
        .replaceAll("{souls}", formatSouls(ctx.souls ?? 0))
        .replaceAll("{name}", ctx.name ?? "")
        .replaceAll("{lasthits}", (ctx.lastHits ?? 0).toString())
        .replaceAll("{minutes}", (ctx.minutes ?? 0).toString())
        .replaceAll("{rank}", ctx.rank ?? "")
        .replaceAll("{losses}", (ctx.losses ?? 0).toString())
        .replaceAll("{losttime}", formatLossTime(ctx.lostSeconds ?? 0))
        .replaceAll("{n}", (n ?? 0).toString());
}

export function filtered(fn : () => string) {
    let line = fn();
    while(BLOCKED.test(line)) line = fn();
    return line;
}

export const formatSouls = (souls : number) => souls >= 1000 ? `${(souls / 1000).toFixed(1)}k` : souls.toString();

// "45 minutes", "1 hour", "3.2 hours"
export function formatLossTime(seconds : number) {
    if(seconds < 60 * 60) return `${Math.round(seconds / 60)} minutes`;
    const hours = (seconds / 60 / 60).toFixed(1).replace(/\.0$/, "");
    return `${hours} ${hours == "1" ? "hour" : "hours"}`;
}
