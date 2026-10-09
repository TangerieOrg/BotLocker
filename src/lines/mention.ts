import { type LineContext, fill, fresh, usable } from "./common.ts";

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
    "Don't shoot the messenger. Shoot the enemy, for once.",
    "What.",
    "I'm not your teammate, I can't carry you.",
    "Your ping has been received and discarded.",
    "Have you tried winning instead?",
    "Respectfully, go queue.",
    "You've reached the complaints line. Please hold for the rest of your life.",
    "Ask the Patron. It's also tired of you.",
    "I'm a bot and I still parry better than you.",
    "Want me to post your match history? Because I will.",
    "No.",
    "I see you've chosen to tag me instead of practising.",
    "Go play Hero Labs.",
    "Ping received. Respect not included.",
    "Is this about your last game? It's always about your last game.",
    "Busy. Someone's feeding mid.",
    "Talk to me when you've hit a Bebop hook. Or dodged one.",
    "Enough out of you.",
    "I'm not angry. I'm just disappointed. And a bot."
];

const MENTION_LOSS_LINES = [
    "You lost as {hero} {ago}. Sit down.",
    "Bold words from someone who just went {kills}/{deaths}/{assists}.",
    "Maybe spend less time tagging me and more time not dying {deaths} times.",
    "I'd listen if your last game wasn't a loss on {hero}.",
    "{deaths} deaths last game and you're picking fights with me?",
    "{name}, you went {kills}/{deaths}/{assists} on {hero}. Sit this one out.",
    "A {kda} KDA and you want my attention?",
    "Last game: loss. This message: also a loss.",
    "Your last game ended {ago}. The embarrassment hasn't.",
    "{name}. The {hero} game. {ago}. We all saw it.",
    "Last time I saw you, you were losing on {hero}. Nothing's changed.",
    "{lasthits} last hits last game. Work on that, not me.",
    "Playing like that in {rank} and you're tagging me?",
    "I'd take you seriously but I've seen your last game.",
    "Still thinking about that {hero} game? Because I am. It was bad.",
    "You lost {ago}. Maybe go practise instead of talking to me.",
    "You've spent {losttime} losing and you want to talk to me?",
    "{losses} losses. {losttime} of feeding. Sit down.",
    "Imagine spending {losttime} losing and still having the confidence to ping me.",
    "{name}, you've lost {losttime} of your life to Deadlock losses. Use the rest wisely. Not like this."
];

const MENTION_WIN_LINES = [
    "One win and suddenly you're tagging me?",
    "Enjoy that win, it's not happening again.",
    "You won one game on {hero}. Calm down.",
    "Don't let one win go to your head.",
    "{name}, you won one game {ago}. The parade's been cancelled.",
    "Won on {hero} and now you're brave.",
    "A {kda} KDA and suddenly you're the main character.",
    "I'll be nice for exactly one game. That was it.",
    "You won {ago}. I've already forgotten.",
    "That {hero} game was alright. Don't push it.",
    "One W and you're in my mentions. Classic.",
    "One win doesn't cancel out {losttime} of losing.",
    "Nice win. Shame about the other {losses} losses."
];

const MENTION_TILT_LINES = [
    "{n} losses in a row and you've got time to tag me?",
    "Loss streak: {n}. Times you've tagged me: too many.",
    "Go fix your {n}-game losing streak first.",
    "{n} straight losses. I'd be quiet too, if I were you.",
    "{name}, you've lost {n} in a row. I'm not the problem here.",
    "{n} straight losses and you chose violence. Against me.",
    "Ping me when you've won one. Could be a while.",
    "{n} Ls in a row. Go to sleep.",
    "I'll talk to you after your {n}-game losing streak ends. So never.",
    "Bold, from someone on a {n}-game losing streak.",
    "{n} in a row, {losttime} of losing. Go outside.",
    "{losttime} of losses. You need a hobby. A different one.",
    "You've lost {losses} games. That's {losttime}. Think about that."
];

const MENTION_UNLINKED_LINES = [
    "Who are you? /link your account and then we'll talk.",
    "I don't even know your stats and I can tell they're bad.",
    "Run /link, coward. Let's see those numbers.",
    "I don't know who you are, but I'm sure you're bad at Deadlock. /link to prove me wrong.",
    "No linked account, no opinion. /link.",
    "Hiding your stats? Smart. /link anyway.",
    "You want my attention? /link your Steam first.",
    "Who? Not linked. Next."
];

export function getMentionLine(ctx? : LineContext & { won: boolean, streak: number, ended: number }) {
    if(Math.random() < 0.4) return fresh(MENTION_LINES);
    if(!ctx) return fresh(MENTION_UNLINKED_LINES);

    const lines = ctx.streak <= -3 ? MENTION_TILT_LINES : ctx.won ? MENTION_WIN_LINES : MENTION_LOSS_LINES;
    return fill(fresh(lines, usable(ctx)), ctx, -ctx.streak).replaceAll("{ago}", `<t:${ctx.ended}:R>`);
}
