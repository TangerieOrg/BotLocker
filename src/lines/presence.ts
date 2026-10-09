import { type LineContext, fill, fresh, usable } from "./common.ts";
import { HERO_LINES } from "./heroes.ts";

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
    "{name} lose the Patron",
    "{name} go {kills}/{deaths}/{assists} on {hero}",
    "{name} feed {deaths} kills to the enemy",
    "{name} get {lasthits} last hits in {minutes} minutes",
    "{name} hold a {kda} KDA",
    "{name} lose in {minutes} minutes",
    "{name} waste {souls} souls",
    "{name} bank {souls} souls and lose anyway",
    "{name} lose in {rank}",
    "{name} play like they're below {rank}",
    "{name} disgrace the {hero} mains",
    "{name} sprint into the respawn timer",
    "{name} miss every parry",
    "{name} run the Urn into five people",
    "{name} carry the enemy team",
    "{name} spectate their own death",
    "{name} explain why it was the team's fault",
    "{name} fall off a zipline",
    "{name} lose the Mid Boss fight",
    "{name} throw a won game",
    "{name}'s Patron fall over",
    "the {hero} game {name} wants deleted",
    "{name} write their own Reddit post",
    "{name}'s {deaths} deaths on loop",
    "{name} donate {deaths} kills"
];

const PRESENCE_WIN_LINES = [
    "{name} get carried",
    "{name} somehow win",
    "{name} get lucky on {hero}",
    "{name} pretend that was skill",
    "{name}'s one good game",
    "{name} win for once",
    "{name} win on {hero} by accident",
    "{name} go {kills}/{deaths}/{assists} and act humble",
    "{name} brag about a {kda} KDA",
    "{name} win in {minutes} minutes",
    "{name} pretend {rank} is a high rank",
    "{name} take the Patron for once",
    "{name}'s team carry them",
    "{name} spend {souls} souls well for once",
    "{name} do a victory lap",
    "{name} frame their one win",
    "{name} survive a whole game",
    "{name} farm {lasthits} last hits",
    "{name} hold the win over everyone"
];

const PRESENCE_GROUP_LOSS_LINES = [
    "{names} lose together",
    "{names} feed as a team",
    "{names} throw together",
    "{names} share the blame",
    "{names} lose as a squad",
    "{names} carry the enemy team",
    "{names} lose the same game",
    "{names} feed in harmony",
    "{names} split the blame evenly",
    "{names} drag each other down",
    "{names} queue together, lose together",
    "{names} throw as a stack",
    "{names} plan their next excuse",
    "{names} donate souls as a group"
];

const PRESENCE_GROUP_WIN_LINES = [
    "{names} get carried together",
    "{names} somehow win together",
    "{names} pretend that was teamwork",
    "{names} win for once",
    "{names} get a group W",
    "{names} share one brain cell and win",
    "{names} stack up and win",
    "{names} take the Patron together",
    "{names} somehow coordinate",
    "{names} celebrate a rare W"
];

const PRESENCE_VERSUS_LINES = [
    "{winners} beat {losers}",
    "{losers} lose to {winners}",
    "{winners} dunk on {losers}",
    "{losers} get bodied by {winners}",
    "{winners} send {losers} home",
    "{losers} feed {winners}",
    "{winners} farm {losers}",
    "{losers} get humbled by {winners}",
    "{winners} settle it with {losers}",
    "{losers} lose a friendship to {winners}",
    "{winners} rinse {losers}",
    "the {winners} vs {losers} grudge match"
];

export function getPresenceLine(name : string, ctx : LineContext, won : boolean) {
    const hero = HERO_LINES[ctx.hero];
    const lines = !won && hero && Math.random() < 0.35 ? hero.presence : won ? PRESENCE_WIN_LINES : PRESENCE_LOSS_LINES;
    return fill(fresh(lines, usable({ ...ctx, name })), { ...ctx, name }).slice(0, 118);
}

export const joinNames = (names : string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function getGroupPresenceLine(winners : string[], losers : string[]) {
    if(winners.length == 0) return fresh(PRESENCE_GROUP_LOSS_LINES).replaceAll("{names}", joinNames(losers)).slice(0, 118);
    if(losers.length == 0) return fresh(PRESENCE_GROUP_WIN_LINES).replaceAll("{names}", joinNames(winners)).slice(0, 118);
    return fresh(PRESENCE_VERSUS_LINES)
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
    "{name} lose in real time",
    "{name} queue right back up",
    "{name} look for revenge",
    "{name} try a hero that isn't {hero}",
    "{name} insist this one will be different",
    "{name} feed live",
    "{name} pick {hero} again for some reason",
    "{name} lose another one, probably",
    "{name} play Deadlock instead of learning it",
    "{name} hunt for a win",
    "{name} roll the dice again"
];

const IN_GAME_WIN_LINES = [
    "{name} try to win two in a row",
    "{name} push their luck",
    "{name} ride a one-game high",
    "{name} queue up still smug about that win",
    "{name} prepare to give that win back",
    "{name} try to make it two",
    "{name} risk it all",
    "{name} test their luck again",
    "{name} queue up confident after that {hero} win",
    "{name} get humbled, hopefully",
    "{name} chase a win streak"
];

const IN_GAME_TILT_LINES = [
    "{name} chase a {n}-game losing streak",
    "{name} go for loss number {next}",
    "{name} tilt-queue after {n} losses",
    "{name} refuse to stop after {n} Ls",
    "{name} lose game {next}, live",
    "{name} try to make it {next} in a row",
    "{name} dig deeper after {n} Ls",
    "{name} keep queuing after {n} losses",
    "{name} try to end a {n}-game slide",
    "{name} ignore the hint after {n} losses"
];

const ONLINE_LOSS_LINES = [
    "{name} hide from Deadlock after that loss",
    "{name} avoid the queue",
    "{name} pretend that last game didn't happen",
    "{name} stare at the play button",
    "{name} think about that {hero} game",
    "{name} write an apology to their team",
    "{name} watch their own replay in silence",
    "{name} hover over the play button",
    "{name} check if it was really their fault (it was)",
    "{name} pretend they're not online",
    "{name} sit in the menu after that loss",
    "{name} sulk about {hero}"
];

const ONLINE_WIN_LINES = [
    "{name} retire on a win",
    "{name} protect their one win",
    "{name} refuse to risk that win",
    "{name} quit while ahead",
    "{name} bask in one win",
    "{name} reread their {hero} stats",
    "{name} enjoy a win while it lasts",
    "{name} hold onto that W"
];

const ONLINE_TILT_LINES = [
    "{name} recover from {n} straight losses",
    "{name} hide after {n} Ls",
    "{name} consider uninstalling after {n} losses",
    "{name} stare at {n} losses in a row",
    "{name} take a break after {n} Ls",
    "{name} blame matchmaking for {n} losses",
    "{name} lick their wounds after {n} Ls"
];

const OTHER_GAME_LINES = [
    "{name} play {game} to cope",
    "{name} cheat on Deadlock with {game}",
    "{name} hide in {game}",
    "{name} lose at {game} instead",
    "{name} take a break from losing with {game}",
    "{name} feed in {game} for a change",
    "{name} find out they're bad at {game} too",
    "{name} run from Deadlock to {game}",
    "{name} pretend {game} is better",
    "{name} play {game}. The Patron misses them",
    "{name} dodge the queue with {game}"
];

const IDLE_LINES = [
    "and waiting for someone to lose",
    "the queue for the next feeder",
    "an empty lobby",
    "nobody play. Cowards",
    "for the next L",
    "and waiting. Someone has to lose eventually",
    "the Patron. It's lonely",
    "the Walkers guard nothing",
    "for someone brave enough to queue",
    "the leaderboard of shame",
    "replays of old losses",
    "and keeping score",
    "nobody. Suspicious",
    "the play button collect dust",
    "the Guardians twiddle their thumbs",
    "match history, waiting for fresh material",
    "the ziplines go nowhere"
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

    return fresh(lines, x => !!ctx.hero || !x.includes("{hero}"))
        .replaceAll("{name}", ctx.name)
        .replaceAll("{hero}", ctx.hero ?? "")
        .replaceAll("{game}", ctx.game ?? "")
        .replaceAll("{n}", (-ctx.streak).toString())
        .replaceAll("{next}", (1 - ctx.streak).toString())
        .slice(0, 118);
}

export const getIdleLine = () => fresh(IDLE_LINES);
