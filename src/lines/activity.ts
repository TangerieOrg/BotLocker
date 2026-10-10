import { fresh } from "./common.ts";
import { HERO_LINES } from "./heroes.ts";
import { joinNames } from "./presence.ts";

// Lines for what linked players are doing right now, from Deadlock's rich presence. Unlike the other status lines {hero} is the hero they're on now

// Prefixed with "Watching " in the status
const IN_MATCH_LINES = [
    "{name} feed as {hero}",
    "{name} try {hero} again",
    "{name} play {hero} like it's their first time",
    "{name} lock in {hero}. Bold",
    "{name} lose lane as {hero}",
    "{name} run it down mid as {hero}",
    "{name} pretend to know {hero}",
    "{name} take {hero} out for a spin",
    "{name} hold W as {hero}",
    "{name} carry? As {hero}? Sure",
    "{name} {minutes} minutes into a {mode} throw",
    "{name} {minutes} minutes deep in {mode}",
    "{name} in {mode}. Pray for their team",
    "{name} sweat through {mode}",
    "{name} in a {mode} game they'll blame on the team",
    "{name} survive {minutes} minutes of {mode}. Somehow",
    "{name} {minutes} minutes in as {hero} and already tilted",
    "{name} pick a hero to throw with",
    "{name} load into another one",
    "{name} in a match. Wish their team luck"
];

const IN_MATCH_GROUP_LINES = [
    "{names} feed together in {mode}",
    "{names} throw {mode} as a team",
    "{names} hold each other back in {mode}",
    "{names} carry each other to a loss",
    "{names} {minutes} minutes into a group feed",
    "{names} bring {heroes} to {mode}",
    "{names} queue up as {heroes}. Brave",
    "{names} and their {heroes} comp",
    "{heroes}. The losing lineup",
    "a {mode} party of {names}. Good luck to their team",
    "{names} share the blame in {mode}"
];

const QUEUE_LINES = [
    "{name} queue up for more pain",
    "{name} wait for a match to throw",
    "{name} queue again. Nobody asked",
    "{name} look for someone new to blame",
    "{name} refresh the queue timer",
    "{name} sit in queue thinking about that {hero} game",
    "{name} queue up to undo that {hero} game"
];

const QUEUE_TILT_LINES = [
    "{name} queue up after {n} straight losses",
    "{name} search for loss number {next}",
    "{name} queue tilted. {n} in a row and counting",
    "{name} chase the win after {n} losses"
];

const QUEUE_GROUP_LINES = [
    "{names} queue up together. Someone stop them",
    "{names} look for a match to throw",
    "{names} wait in queue, sharing the blame in advance",
    "{names} stack up for a group loss",
    "the {names} party in queue",
    "{names} find out who's carrying tonight. Nobody"
];

// Worded to follow a name in /online ("Josh - probably losing")
const IN_MATCH_STATUS = [
    "probably losing",
    "currently feeding",
    "busy throwing",
    "deciding who to blame",
    "fighting for their life",
    "{minutes} minutes in, no excuses yet",
    "{minutes} minutes of suffering so far",
    "playing {hero} for some reason"
];

const QUEUE_STATUS = [
    "looking for a match to lose",
    "in queue, overthinking it",
    "waiting for the next L",
    "about to make it everyone's problem",
    "queueing up again"
];

export interface MatchActivity {
    // More than one when a party is in the match together, heroes lines up with names
    names: string[];
    heroes: (string | undefined)[];
    mode?: string;
    minutes?: number;
}

export interface QueueActivity {
    names: string[];
    // Their last game, only used when they're queueing alone
    hero?: string;
    streak?: number;
}

function fillActivity(line : string, ctx : { names: string[], heroes?: (string | undefined)[], hero?: string, mode?: string, minutes?: number, streak?: number }) {
    const heroes = ctx.heroes?.filter(x => x) as string[] | undefined;
    return line
        .replaceAll("{names}", joinNames(ctx.names))
        .replaceAll("{name}", ctx.names[0])
        .replaceAll("{heroes}", joinNames(heroes ?? []))
        .replaceAll("{hero}", ctx.hero ?? heroes?.[0] ?? "")
        .replaceAll("{mode}", ctx.mode ?? "")
        .replaceAll("{minutes}", (ctx.minutes ?? 0).toString())
        .replaceAll("{n}", (-(ctx.streak ?? 0)).toString())
        .replaceAll("{next}", (1 - (ctx.streak ?? 0)).toString())
        .slice(0, 118);
}

// Like fresh, but if every line needs something that isn't known it uses whichever ones need the least rather than nothing
function pickFrom(pool : string[], filter : (line : string) => boolean) {
    return pool.some(filter) ? fresh(pool, filter) : fresh(pool, x => !/\{(hero|heroes|mode|minutes)\}/.test(x));
}

// Skip lines that need something that isn't known yet (hero select has no hero or minutes, a mode nobody's seen etc)
const keep = (ctx : { hero?: string, heroes?: (string | undefined)[], mode?: string, minutes?: number }) => (line : string) =>
    (!line.includes("{hero}") || !!(ctx.hero ?? ctx.heroes?.[0])) &&
    (!line.includes("{heroes}") || !!ctx.heroes?.length && ctx.heroes.every(x => x)) &&
    (!line.includes("{mode}") || !!ctx.mode) &&
    (!line.includes("{minutes}") || !!ctx.minutes);

export function getMatchPresenceLine(ctx : MatchActivity) {
    if(ctx.names.length > 1) return fillActivity(pickFrom(IN_MATCH_GROUP_LINES, keep(ctx)), ctx);

    // Same chance as the results lines of going for something about their hero
    const hero = ctx.heroes[0] ? HERO_LINES[ctx.heroes[0]] : undefined;
    if(hero && Math.random() < 0.35) return fillActivity(fresh(hero.presence), ctx);
    return fillActivity(pickFrom(IN_MATCH_LINES, keep(ctx)), ctx);
}

export function getQueuePresenceLine(ctx : QueueActivity) {
    if(ctx.names.length > 1) return fillActivity(fresh(QUEUE_GROUP_LINES), ctx);
    const lines = (ctx.streak ?? 0) <= -3 ? QUEUE_TILT_LINES : QUEUE_LINES;
    return fillActivity(pickFrom(lines, keep(ctx)), ctx);
}

export const getMatchStatusLine = (ctx : MatchActivity) => fillActivity(pickFrom(IN_MATCH_STATUS, keep(ctx)), ctx);

export const getQueueStatusLine = () => fresh(QUEUE_STATUS);
