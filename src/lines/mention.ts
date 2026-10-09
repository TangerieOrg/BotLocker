import { type LineContext, fill, pick } from "./common.ts";

// Replies when someone @s the bot
const MENTION_LINES = [
    "Shut up.",
    "Did I ask?",
    "Go queue.",
    "Tagging me won't fix your K/D.",
    "I'm busy watching someone else feed.",
    "Complaints department is closed.",
    "Take it up with the Patron.",
    "Cry about it in the next match.",
    "Not now, I'm watching the replay of your last game.",
    "Noted. Ignored.",
    "Ping me again and I'll read your match history out loud.",
    "You've got the same energy as a Bebop missing every hook.",
    "I don't make the losses, I just report them.",
    "Don't shoot the messenger. Shoot the enemy, for once."
];

const MENTION_LOSS_LINES = [
    "You lost as {hero} {ago}. Sit down.",
    "Bold words from someone who just went {kills}/{deaths}/{assists}.",
    "Maybe spend less time tagging me and more time not dying {deaths} times.",
    "I'd listen if your last game wasn't a loss on {hero}.",
    "{deaths} deaths last game and you're picking fights with me?"
];

const MENTION_WIN_LINES = [
    "One win and suddenly you're tagging me?",
    "Enjoy that win, it's not happening again.",
    "You won one game on {hero}. Calm down.",
    "Don't let one win go to your head."
];

const MENTION_TILT_LINES = [
    "{n} losses in a row and you've got time to tag me?",
    "Loss streak: {n}. Times you've tagged me: too many.",
    "Go fix your {n}-game losing streak first.",
    "{n} straight losses. I'd be quiet too, if I were you."
];

const MENTION_UNLINKED_LINES = [
    "Who are you? /link your account and then we'll talk.",
    "I don't even know your stats and I can tell they're bad.",
    "Run /link, coward. Let's see those numbers."
];

export function getMentionLine(ctx? : LineContext & { won: boolean, streak: number, ended: number }) {
    if(Math.random() < 0.5) return pick(MENTION_LINES);
    if(!ctx) return pick(MENTION_UNLINKED_LINES);

    const lines = ctx.streak <= -3 ? MENTION_TILT_LINES : ctx.won ? MENTION_WIN_LINES : MENTION_LOSS_LINES;
    return fill(pick(lines), ctx, -ctx.streak).replaceAll("{ago}", `<t:${ctx.ended}:R>`);
}
