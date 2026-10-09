import { formatLossTime, fresh } from "./common.ts";
import type { StatusContext } from "./presence.ts";

// Same idea as the status lines, worded to follow a name in /online ("Josh - hiding from Deadlock...")
const ONLINE_LOSS_STATUS = [
    "hiding from Deadlock after that loss",
    "avoiding the queue",
    "pretending that last game didn't happen",
    "staring at the play button",
    "too scared to queue",
    "recovering from that last one",
    "rethinking their life choices",
    "rewatching their own replay",
    "blaming the team",
    "drafting an apology to their teammates",
    "looking at the play button and sighing",
    "pretending to be AFK",
    "googling how to parry",
    "processing {losttime} of losses",
    "recovering from {losses} losses"
];

const ONLINE_WIN_STATUS = [
    "retiring on a win",
    "protecting their one win",
    "refusing to risk that win",
    "still celebrating one win",
    "riding a one-game high",
    "refusing to queue in case they lose",
    "telling everyone about one win",
    "quitting while ahead",
    "enjoying a rare W"
];

const ONLINE_TILT_STATUS = [
    "recovering from {n} straight losses",
    "hiding after {n} Ls",
    "considering uninstalling after {n} losses",
    "nursing {n} straight losses",
    "rethinking Deadlock after {n} Ls",
    "blaming matchmaking for {n} losses",
    "taking a break after {n} losses (good)",
    "staring at {n} losses in a row",
    "recovering from {losttime} of losing",
    "reflecting on {losttime} of losses"
];

// Every line here should mention {game} so it's clear what they're playing
const OTHER_GAME_STATUS = [
    "playing {game} to cope",
    "cheating on Deadlock with {game}",
    "hiding in {game}",
    "losing at {game} instead",
    "taking a break from Deadlock with {game}",
    "feeding in {game} for a change",
    "finding out they're bad at {game} too",
    "running away to {game}",
    "pretending {game} is better",
    "dodging the queue with {game}"
];

// losses/lostSeconds are since the guild's last reset, lines needing them are skipped without any
export function getOnlineStatusLine(ctx : Omit<StatusContext, "name" | "inDeadlock"> & { losses?: number, lostSeconds?: number }) {
    const lines = ctx.game ? OTHER_GAME_STATUS :
        ctx.streak <= -3 ? ONLINE_TILT_STATUS :
        ctx.won ? ONLINE_WIN_STATUS : ONLINE_LOSS_STATUS;

    const keep = (x : string) => (!!ctx.lostSeconds || !x.includes("{losttime}")) && ((ctx.losses ?? 0) > 1 || !x.includes("{losses}"));

    return fresh(lines, keep)
        .replaceAll("{game}", ctx.game ?? "")
        .replaceAll("{n}", (-ctx.streak).toString())
        .replaceAll("{losses}", (ctx.losses ?? 0).toString())
        .replaceAll("{losttime}", formatLossTime(ctx.lostSeconds ?? 0));
}
