import insulter from "insult";
import InsultCompliment from "insult-compliment";
import { type LineContext, fill, filtered, pick, usable } from "./common.ts";

const LOSS_LINES = [
    "{deaths} deaths. The enemy team should be paying you a salary.",
    "You fed {deaths} times on {hero}. Somewhere a Walker is crying.",
    "{kills}/{deaths}/{assists} on {hero}. Even the troopers had a better game.",
    "Your Patron would have done more damage standing still. Oh wait, it did.",
    "You donated {deaths} kills worth of souls to the enemy. Very charitable.",
    "Lost with {souls} souls. You had the money, just not the brain.",
    "Did you buy a single item or just hoard souls like a dragon?",
    "Bold strategy, dying {deaths} times. Let's see if it pays off. It didn't.",
    "The Mid Boss had better map awareness than you.",
    "You ran the Urn straight into five people, didn't you.",
    "Imagine losing on {hero}. Couldn't be me. Was you though.",
    "That wasn't a loss, that was a public service announcement about {hero} players.",
    "You spent more time on the respawn timer than in the lane.",
    "Have you considered that the zipline only goes one way for a reason?",
    "Your team was 4v6. You were the sixth.",
    "{hero} has a skill ceiling. You found the floor.",
    "Nice {deaths} deaths. Was that a speedrun?",
    "Even the Guardians are embarrassed for you.",
    "Your last hits are a rumour.",
    "Somewhere a bot match is waiting for you. Go home.",
    "You got out-farmed by the creep waves.",
    "{kills} kills. Respectfully, the neutral camps scored more.",
    "You played {hero} like you'd never seen the hero before. Have you?",
    "Your build path was 'whatever was glowing in the shop'.",
    "The enemy's Rejuvenator wasn't the reason you lost. You were.",
    "You heal the enemy team more than your support heals you.",
    "Uninstall is a free action.",
    "{deaths} deaths, {kills} kills. Your K/D looks like a bank balance after Christmas.",
    "If dying gave souls you'd be first on the leaderboard.",
    "They didn't even need to take Patron, they just needed you to keep playing.",
    "You were the reason the enemy jungler got fed.",
    "You saw the enemy team, walked towards them, and chose violence. Against yourself.",
    "You were technically in the game.",
    "At least you have {souls} souls to take with you to the grave.",
    "The ziplines carried you further than your team did. Barely.",
    "Breaking news: local {hero} still has not found the parry button.",
    "Ever heard of a stamina bar? Clearly not.",
    "You had the impact of a single trooper. A dead one.",
    "Your mid boss contribution: spectating.",
    "{assists} assists and still lost. Supporting the wrong team?",
    "Was the enemy team in your Discord or are you just like that?",
    "Your crosshair placement was optimised for the ceiling.",
    "Next time try shooting the guys in the other colour.",
    "The shopkeeper misses you. You spent so much time back at base.",
    "Your Walker fell faster than your rank.",
    "Did you queue up with your monitor off?",
    "You lost so hard the replay file filed a complaint.",
    "It's not a throw if you were never winning.",
    "{hero} main? More like {hero} mistake.",
    "Your lane opponent wants to thank you personally.",
    "This is your sign to try Hero Labs. Or knitting.",
    "There's a teammate somewhere writing a Reddit post about you right now.",
    "You had {deaths} deaths and somehow that's not even the worst part.",
    "The only thing you carried was the enemy team.",
    "Your teammates have muted you. Spiritually.",
    "You walked into every single Bebop hook, didn't you.",
    "Enemy Patron at full health. Mission accomplished, I guess.",
    "The Shrine wasn't going to defend itself. You certainly weren't.",
    "Souls: {souls}. Impact: none.",
    "Maybe the real Deadlock was the losses we stacked along the way."
];

const WIN_LINES = [
    "Won on {hero} with {kills} kills. Who are you and what have you done with the real one?",
    "{kills}/{deaths}/{assists}. Fine. That was alright. Don't let it go to your head.",
    "You won! Your teammates must have been incredible.",
    "Patron down. Even a broken clock is right twice a day.",
    "A win on {hero}? Screenshot it, it might not happen again.",
    "{souls} souls and a win. Look at you being useful.",
    "Congratulations on getting carried. Very well executed.",
    "Not bad. The enemy team must have been playing with their feet.",
    "You won. Don't get used to it.",
    "Your Walker survived. That's growth.",
    "Clean game on {hero}. Suspiciously clean.",
    "Only {deaths} deaths? Who's been coaching you?",
    "The enemy team is writing a Reddit post about you. A nice one, for once.",
    "Big game. Please stop before you go back to normal.",
    "{kills} kills. The enemy team should report you for griefing them.",
    "A win! Quick, log off before the next one ruins it.",
    "Rare W. Frame it.",
    "You actually bought items this time. Proud of you.",
    "Shrines down, Patron down, ego up.",
    "Nice. The Mid Boss is yours. The respect is pending."
];

const TILT_LINES : Array<[number, string[]]> = [
    [8, [
        "{n} losses in a row. This is a cry for help.",
        "{n} straight losses. At this point the game is playing you.",
        "{n} in a row. Please go outside. Touch grass. Any grass."
    ]],
    [5, [
        "{n} losses in a row. The Steam refund window has closed, sorry.",
        "{n}-game losing streak. Maybe it's not the teammates.",
        "That's {n} in a row. Tilted doesn't begin to describe it."
    ]],
    [3, [
        "{n} in a row. Maybe uninstall?",
        "{n} losses straight. Time for a break, champ.",
        "Losing streak: {n}. Getting warmed up?"
    ]]
];

const DERANK_LINES = [
    "And you deranked. Pack your bags.",
    "Deranked! The badge was never really yours anyway.",
    "Rank down. Your old badge is in a better place now.",
    "Demoted. Welcome back to where you belong."
];

const STREAK_BROKEN_LINES = [
    "Finally. Only took {n} losses.",
    "Losing streak over after {n} games. Mercy.",
    "{n}-game losing streak broken. The prophecy is fulfilled."
];

const HERO_LINES : Record<string, string[]> = {
    "Bebop": ["You missed every hook. Every single one."],
    "Haze": ["Haze ult and still lost. Impressive in its own way."],
    "Seven": ["Seven ult in the open, again. They saw you from orbit."],
    "Lash": ["Your ground strikes hit the ground. That's about it."],
    "Yamato": ["Shadow Transformation and you still died. Some samurai."],
    "Mo & Krill": ["You combo'd yourself into the fountain."],
    "Dynamo": ["Your Singularity caught zero enemies and three teammates' disappointment."],
    "McGinnis": ["Your turrets got more kills than you did."],
    "Ivy": ["You carried your teammate straight into the enemy team."],
    "Abrams": ["Shoulder-charged into five people. Classic Abrams."],
    "Paradox": ["You swapped yourself into the worst position on the map."],
    "Wraith": ["Your card trick was making the win disappear."],
    "Vindicta": ["You were flying the whole game and still found a way to die."],
    "Infernus": ["You set yourself on fire, metaphorically."],
    "Viscous": ["You rolled into the enemy base and never rolled back."],
    "Grey Talon": ["Your arrows had the accuracy of a stormtrooper."],
    "Shiv": ["Rage meter full, impact empty."],
    "Pocket": ["You hid in your suitcase and the team lost anyway."],
    "Lady Geist": ["You spent all your health and got nothing back."],
    "Kelvin": ["Your ice path led straight to the enemy fountain."],
    "Warden": ["You were supposed to be the one locking people up."],
    "Mirage": ["Your djinn's mark found nobody. Neither did you."],
    "Holliday": ["You bounced off the pad and straight into death."],
    "Calico": ["Nine lives and you used all of them."]
};

export function getInsult(ctx : LineContext) {
    if(Math.random() < 0.5) return filtered(() => insulter.Insult());
    const heroLines = HERO_LINES[ctx.hero];
    if(heroLines && Math.random() < 0.3) return fill(pick(usable(heroLines, ctx)), ctx);
    return fill(pick(usable(LOSS_LINES, ctx)), ctx);
}

export function getCompliment(ctx : LineContext) {
    if(Math.random() < 0.5) return filtered(() => InsultCompliment.Compliment());
    return fill(pick(usable(WIN_LINES, ctx)), ctx);
}

export function getTiltLine(ctx : LineContext, streak : number) {
    for(const [min, lines] of TILT_LINES) {
        if(streak >= min) return fill(pick(lines), ctx, streak);
    }
    return undefined;
}

export const getDerankLine = () => pick(DERANK_LINES);

export const getStreakBrokenLine = (ctx : LineContext, streak : number) => fill(pick(STREAK_BROKEN_LINES), ctx, streak);
