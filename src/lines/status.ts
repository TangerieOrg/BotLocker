import { pick } from "./common.ts";
import type { StatusContext } from "./presence.ts";

// Same idea as the status lines, worded to follow a name in /online ("Josh - hiding from Deadlock...")
const ONLINE_LOSS_STATUS = [
    "hiding from Deadlock after that loss",
    "avoiding the queue",
    "pretending that last game didn't happen",
    "staring at the play button",
    "too scared to queue"
];

const ONLINE_WIN_STATUS = [
    "retiring on a win",
    "protecting their one win",
    "refusing to risk that win",
    "still celebrating one win"
];

const ONLINE_TILT_STATUS = [
    "recovering from {n} straight losses",
    "hiding after {n} Ls",
    "considering uninstalling after {n} losses"
];

// Every line here should mention {game} so it's clear what they're playing
const OTHER_GAME_STATUS = [
    "playing {game} to cope",
    "cheating on Deadlock with {game}",
    "hiding in {game}",
    "losing at {game} instead"
];

export function getOnlineStatusLine(ctx : Omit<StatusContext, "name" | "inDeadlock">) {
    const lines = ctx.game ? OTHER_GAME_STATUS :
        ctx.streak <= -3 ? ONLINE_TILT_STATUS :
        ctx.won ? ONLINE_WIN_STATUS : ONLINE_LOSS_STATUS;

    return pick(lines)
        .replaceAll("{game}", ctx.game ?? "")
        .replaceAll("{n}", (-ctx.streak).toString());
}
