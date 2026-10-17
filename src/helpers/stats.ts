import type { Match } from "../db/mod.ts";
import { now } from "./now.ts";

export const sum = <T>(rows : T[], f : (x : T) => number) => rows.reduce((n, x) => n + f(x), 0);

export const kda = (rows : Match[]) => (sum(rows, x => x.kills) + sum(rows, x => x.assists)) / Math.max(sum(rows, x => x.deaths), 1);

export const pct = (n : number, of : number) => `${Math.round(n / of * 100)}%`;

export function record(rows : { won : number }[]) {
    const wins = sum(rows, x => x.won);
    return `${wins}W - ${rows.length - wins}L (${pct(wins, rows.length)})`;
}

export function formatPlayed(s : number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor(s % 3600 / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Rows come newest first, so the current streak is the run at the front
export function streaks(rows : { won : number }[]) {
    let current = 0;
    while(current < rows.length && rows[current].won == rows[0].won) current++;

    let best = 0, run = 0;
    for(const x of rows) {
        run = x.won ? run + 1 : 0;
        best = Math.max(best, run);
    }
    return { current: rows[0]?.won ? current : -current, best };
}

const DAY = 24 * 60 * 60;

export const PERIODS : Record<string, { name: string, label: string, since: () => number }> = {
    all: { name: "All time", label: "All stored games", since: () => 0 },
    day: { name: "Last 24 hours", label: "Last 24 hours", since: () => now() - DAY },
    week: { name: "Last 7 days", label: "Last 7 days", since: () => now() - 7 * DAY },
    month: { name: "Last 30 days", label: "Last 30 days", since: () => now() - 30 * DAY }
};
