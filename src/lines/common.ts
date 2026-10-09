export interface LineContext {
    hero: string;
    kills: number;
    deaths: number;
    assists: number;
    souls?: number;
}

const BLOCKED = /\b(women|toilet|kiss|bed|hot|nickel)\b/i;

export const pick = <T,>(xs : T[]) => xs[Math.floor(Math.random() * xs.length)];

// Souls aren't shown for Street Brawl, so skip lines that mention them
export const usable = (lines : string[], ctx : LineContext) => ctx.souls == null ? lines.filter(x => !x.includes("{souls}")) : lines;

export function fill(line : string, ctx : LineContext, n? : number) {
    return line
        .replaceAll("{hero}", ctx.hero)
        .replaceAll("{kills}", ctx.kills.toString())
        .replaceAll("{deaths}", ctx.deaths.toString())
        .replaceAll("{assists}", ctx.assists.toString())
        .replaceAll("{souls}", formatSouls(ctx.souls ?? 0))
        .replaceAll("{n}", (n ?? 0).toString());
}

export function filtered(fn : () => string) {
    let line = fn();
    while(BLOCKED.test(line)) line = fn();
    return line;
}

export const formatSouls = (souls : number) => souls >= 1000 ? `${(souls / 1000).toFixed(1)}k` : souls.toString();
