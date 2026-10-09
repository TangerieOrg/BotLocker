import { type LineContext, fill, pick, usable } from "./common.ts";

// Prefixed with "Watching " in the status
const PRESENCE_LOSS_LINES = [
    "{name} lose",
    "{name} lose as {hero}",
    "{name} feed on {hero}",
    "{name} die {deaths} times",
    "{name} throw again",
    "{name} uninstall soon",
    "{name} blame the team",
    "{name} hand out free souls",
    "{name} go {kills}/{deaths}/{assists}",
    "{name} ruin {hero}",
    "the replay of {name}'s crimes",
    "{name} lose the Patron"
];

const PRESENCE_WIN_LINES = [
    "{name} get carried",
    "{name} somehow win",
    "{name} get lucky on {hero}",
    "{name} pretend that was skill",
    "{name}'s one good game",
    "{name} win for once"
];

const PRESENCE_GROUP_LOSS_LINES = [
    "{names} lose together",
    "{names} feed as a team",
    "{names} throw together",
    "{names} share the blame",
    "{names} lose as a squad",
    "{names} carry the enemy team"
];

const PRESENCE_GROUP_WIN_LINES = [
    "{names} get carried together",
    "{names} somehow win together",
    "{names} pretend that was teamwork",
    "{names} win for once"
];

const PRESENCE_VERSUS_LINES = [
    "{winners} beat {losers}",
    "{losers} lose to {winners}",
    "{winners} dunk on {losers}",
    "{losers} get bodied by {winners}"
];

export function getPresenceLine(name : string, ctx : LineContext, won : boolean) {
    return fill(pick(usable(won ? PRESENCE_WIN_LINES : PRESENCE_LOSS_LINES, ctx)), ctx).replaceAll("{name}", name).slice(0, 118);
}

export const joinNames = (names : string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function getGroupPresenceLine(winners : string[], losers : string[]) {
    if(winners.length == 0) return pick(PRESENCE_GROUP_LOSS_LINES).replaceAll("{names}", joinNames(losers)).slice(0, 118);
    if(losers.length == 0) return pick(PRESENCE_GROUP_WIN_LINES).replaceAll("{names}", joinNames(winners)).slice(0, 118);
    return pick(PRESENCE_VERSUS_LINES)
        .replaceAll("{winners}", joinNames(winners))
        .replaceAll("{losers}", joinNames(losers))
        .slice(0, 118);
}

// Status lines for linked players currently online on Steam. Steam doesn't say which hero they're on now, so {hero} is always their last game
const IN_GAME_LOSS_LINES = [
    "{name} queue up to feed again",
    "{name} try to undo that last loss",
    "{name} go for another L",
    "{name} spam queue after losing",
    "{name} queue again after that {hero} game",
    "{name} try to forget that {hero} game",
    "{name} attempt Deadlock",
    "{name} lose in real time"
];

const IN_GAME_WIN_LINES = [
    "{name} try to win two in a row",
    "{name} push their luck",
    "{name} ride a one-game high",
    "{name} queue up still smug about that win",
    "{name} prepare to give that win back"
];

const IN_GAME_TILT_LINES = [
    "{name} chase a {n}-game losing streak",
    "{name} go for loss number {next}",
    "{name} tilt-queue after {n} losses",
    "{name} refuse to stop after {n} Ls"
];

const ONLINE_LOSS_LINES = [
    "{name} hide from Deadlock after that loss",
    "{name} avoid the queue",
    "{name} pretend that last game didn't happen",
    "{name} stare at the play button"
];

const ONLINE_WIN_LINES = [
    "{name} retire on a win",
    "{name} protect their one win",
    "{name} refuse to risk that win"
];

const ONLINE_TILT_LINES = [
    "{name} recover from {n} straight losses",
    "{name} hide after {n} Ls",
    "{name} consider uninstalling after {n} losses"
];

const OTHER_GAME_LINES = [
    "{name} play {game} to cope",
    "{name} cheat on Deadlock with {game}",
    "{name} hide in {game}",
    "{name} lose at {game} instead"
];

const IDLE_LINES = [
    "and waiting for someone to lose",
    "the queue for the next feeder",
    "an empty lobby",
    "nobody play. Cowards",
    "for the next L",
    "and waiting. Someone has to lose eventually"
];

export interface StatusContext {
    name: string;
    hero?: string;
    game?: string;
    inDeadlock: boolean;
    won: boolean;
    streak: number;
}

export function getOnlinePresenceLine(ctx : StatusContext) {
    const tilted = ctx.streak <= -3;
    const lines = ctx.inDeadlock ?
        (tilted ? IN_GAME_TILT_LINES : ctx.won ? IN_GAME_WIN_LINES : IN_GAME_LOSS_LINES) :
        ctx.game ? OTHER_GAME_LINES :
        (tilted ? ONLINE_TILT_LINES : ctx.won ? ONLINE_WIN_LINES : ONLINE_LOSS_LINES);

    return pick(ctx.hero ? lines : lines.filter(x => !x.includes("{hero}")))
        .replaceAll("{name}", ctx.name)
        .replaceAll("{hero}", ctx.hero ?? "")
        .replaceAll("{game}", ctx.game ?? "")
        .replaceAll("{n}", (-ctx.streak).toString())
        .replaceAll("{next}", (1 - ctx.streak).toString())
        .slice(0, 118);
}

export const getIdleLine = () => pick(IDLE_LINES);
