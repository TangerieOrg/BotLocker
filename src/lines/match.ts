import insulter from "insult";
import InsultCompliment from "insult-compliment";
import { type LineContext, fill, filtered, fresh, usable } from "./common.ts";
import { HERO_LINES } from "./heroes.ts";

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
    "Maybe the real Deadlock was the losses we stacked along the way.",
    "A {kda} KDA and a loss. Stats don't win games, apparently.",
    "{lasthits} last hits in {minutes} minutes. The troopers were safer with you than with their own team.",
    "{minutes} minutes of your life you'll never get back. Same for your teammates.",
    "{kills}/{deaths}/{assists}. I've seen better numbers on a parking ticket.",
    "A {kda} KDA on {hero}. Valve should patch you.",
    "{deaths} deaths in {minutes} minutes. You were dying on a schedule.",
    "{lasthits} last hits. The souls were right there, mate.",
    "{lasthits} last hits. Were you farming or just looking at the troopers?",
    "Troopers come in waves, you know. Every single one walked past you.",
    "Playing like that in {rank}? Bold.",
    "{rank} and still went {kills}/{deaths}/{assists}. The badge is lying.",
    "Your {rank} badge is pending review.",
    "A loss on {hero} in {rank}. Someone check if this account is shared.",
    "{name}, the enemy team sends their regards. And their thanks.",
    "{name} has once again been held back by {name}.",
    "Nobody blame the team. Blame {name}.",
    "{souls} souls and nothing to show for it. Sounds like your bank account.",
    "{souls} souls spent on items that clearly did nothing.",
    "You had {souls} souls and the decision-making of a trooper.",
    "Respawn timer: your most-viewed screen.",
    "The enemy Walker didn't take a scratch. It's thriving.",
    "You were the enemy's best player and you weren't even on their team.",
    "Your parry timing is a coin flip that always lands on tails.",
    "Even the Sinner's Sacrifice gave your team more than you did.",
    "You tried to steal the Urn and it stole your dignity.",
    "Ziplining into the enemy team isn't a rotation, it's a delivery.",
    "You were shopping while your team was fighting. Again.",
    "Your map awareness ends at the edge of your monitor.",
    "Every death is a lesson. You learned nothing {deaths} times.",
    "Somewhere a Hero Labs bot is playing better than you.",
    "You didn't lose lane, lane lost you.",
    "{assists} assists. You were helping, just not in a way anyone could see.",
    "The Rejuvenator went to the enemy. So did the game.",
    "You were one of six players on your team. Allegedly.",
    "Your crosshair was in another lane.",
    "You played like the game was still loading.",
    "I've seen Guardians with more killing intent.",
    "You weren't playing {hero}, you were wearing it as a costume.",
    "Your team had a plan. You had a different plan. You both lost.",
    "The enemy team's Discord is talking about you. Fondly.",
    "That's what happens when you build {hero} by vibes.",
    "{deaths} deaths. You died more than the troopers in your lane.",
    "Every time you died, a souls counter ticked up. Theirs.",
    "You're the reason respawn timers exist.",
    "You played {minutes} minutes of Deadlock and Deadlock won.",
    "You treated the jungle like a museum. Look, don't touch.",
    "Your contribution to the Patron fight: watching it from spawn.",
    "You heard footsteps behind you and decided it was nothing. It was something.",
    "The scoreboard has you at {kills}/{deaths}/{assists}. The scoreboard is being kind.",
    "Next time just stand in base. Same impact, fewer souls for them.",
    "You and the enemy carry had a great partnership. Mostly for them.",
    "Nobody on your team blamed you. They've given up hope.",
    "Death count: {deaths}. Win count: zero. Fun count: also zero.",
    "You walked into the fight like you had your ult up. You did not.",
    "Your ult was up the whole game. Saving it for the next match?",
    "Stamina management? You treated it like a suggestion.",
    "You dashed into them. You dashed into them again. You did this {deaths} times.",
    "Reported for feeding. By me. Just now.",
    "Your team needed a hero. They got a {hero}.",
    "You've been demoted from player to spectator with extra steps.",
    "{name} dropped {deaths} deaths on {hero}. It's in the history books now. The bad section.",
    "Did you queue with a controller?",
    "Your aim was so off the enemy thought you were on their side.",
    "Your Shrine fell. Your rank fell. Your standards fell long before either.",
    "You should get a commission on every soul you handed over.",
    "You died to the same person {deaths} times. That's a relationship now.",
    "You got ganked so often you should take out a restraining order.",
    "Your teammates spent the match pinging you. Not for help.",
    "This loss was brought to you by your decision-making.",
    "Your healing item sat in your inventory all game like a museum piece.",
    "You bought Unstoppable and still got stopped.",
    "You pressed every button except the one that wins games.",
    "You had the right idea about the Urn. The wrong idea about everything else.",
    "The enemy scoreboard would be {deaths} kills lighter without you.",
    "{kills} kills on {hero}. That's not a stat line, that's a typo.",
    "Your souls per minute is classified, for your own protection.",
    "You lost. In {minutes} minutes. On {hero}. With {deaths} deaths. Any questions?",
    "Your best play was alt-tabbing.",
    "Some players have game sense. You have game nonsense.",
    "That's a loss on {hero}, the hero you swore you were good at.",
    "Not one Guardian was harmed in the making of this match.",
    "You lost the teamfight before it even started. Mostly by being dead.",
    "The enemy team won and they barely know your name. You were that forgettable.",
    "Your parry hit the air with incredible confidence.",
    "That's {losttime} spent losing so far. Hope it was fun.",
    "{losses} losses. That's {losttime} you'll never get back.",
    "Running total: {losttime} of losing. And counting.",
    "You've now spent {losttime} losing Deadlock games. Worth it?",
    "Add it to the pile. {losttime} of losses and counting.",
    "You've lost {losses} games and {losttime} of your life.",
    "{losttime} of losing. You could have learned a language.",
    "Loss number {losses}. Total time wasted: {losttime}.",
    "{losttime} of losing. Your Steam hours are a cry for help."
];

const WIN_LINES = [
    "Won on {hero} with {kills} kills. That's how it's done.",
    "{kills}/{deaths}/{assists}. Proper game, well played.",
    "A {kda} KDA and a win. Textbook.",
    "Patron down. You earned every bit of that one.",
    "Great game on {hero}. You made it look easy.",
    "{souls} souls and you spent every one of them well.",
    "Clean, confident, and a W. Lovely stuff.",
    "You read that game perfectly.",
    "That's a win, and you were a big part of it.",
    "Your Walker held, your team held, you held. Well played.",
    "Strong game on {hero}. The enemy team had no answers.",
    "The enemy team will be thinking about you on the drive home.",
    "Big game. Keep that energy for the next one.",
    "{kills} kills on {hero}. You were a problem for them all game.",
    "Shrines down, Patron down. Fantastic work.",
    "You took the Mid Boss and turned it into a win. Smart play.",
    "A {kda} KDA. You were everywhere you needed to be.",
    "{lasthits} last hits. Farming like that wins games, and it just did.",
    "A win in {rank}. You belong there.",
    "{rank} and playing like you're above it. Great stuff.",
    "{name} with the W. Well deserved.",
    "{name} on {hero} was a nightmare to play against.",
    "No excuses needed, just a well-earned win.",
    "You showed up for your team today. GG.",
    "Great rotations, great fights, great result.",
    "Good game. You can type that one in chat with your chest out.",
    "{kills} kills. The enemy team couldn't keep up.",
    "You won with {souls} souls and a build that made total sense. Love to see it.",
    "You played like you knew exactly what was coming.",
    "The Urn got delivered and so did the win. Well played.",
    "You made the plays that mattered. GG.",
    "A win to be proud of.",
    "That's how you close out a game.",
    "Your parries were perfectly timed. Big outplays.",
    "Your positioning was spot on all game.",
    "You dove the backline and came out on top. Huge.",
    "A win on {hero}. You're getting really good on this hero.",
    "The Walkers fell and you were right there leading the push.",
    "Good game. The enemy team never found a way through you.",
    "{kills}/{deaths}/{assists}. Screenshot it, that's a good one.",
    "Winning looks good on you.",
    "Great decision-making from start to finish.",
    "You and your team were on the same page all game. That's a W.",
    "That's a W you can feel good about.",
    "Calm under pressure. Nice one.",
    "Your map awareness was sharp today.",
    "A win and a solid stat line. What more could you want?",
    "Every fight you took, you took for a reason. Well played.",
    "A {kda} KDA. Absolutely cooking.",
    "{lasthits} last hits. Nobody farmed like you did.",
    "Won on {hero}. Every {hero} main would be proud of that game.",
    "Didn't feed, didn't throw, didn't lose. Perfect.",
    "{name} got the W. Very well played.",
    "That was a carry performance.",
    "You made your teammates' jobs easy. Great teammate.",
    "Huge win. Go get a drink, you've earned it.",
    "You played your role perfectly.",
    "Brilliant game. That's the standard now.",
    "You outplayed them. Simple as that.",
    "Big plays, smart plays, winning plays.",
    "One more W on the board. Keep stacking them.",
    "{losses} losses in the books and you keep coming back to win games like this. Respect."
];

// Games over before 20 minutes, someone got stomped
const STOMP_LOSS_LINES = [
    "Lost in {minutes} minutes. That's not a game, that's a mugging.",
    "{minutes} minutes. The enemy team barely had time to finish their drinks.",
    "Over in {minutes} minutes. You didn't lose, you were deleted.",
    "A {minutes}-minute loss. The Walkers didn't even get to warm up.",
    "That game was shorter than your queue time.",
    "{minutes} minutes from start to Patron. A personal best. For them.",
    "Speedrun any%, enemy team's category.",
    "They took the Patron before you finished your build.",
    "You blinked and the Shrines were gone.",
    "Lost in {minutes} minutes. Your microwave meals take longer.",
    "That wasn't a match, that was a hostage situation.",
    "{minutes} minutes. Quick and painless. Well, quick."
];

const STOMP_WIN_LINES = [
    "Won in {minutes} minutes. Absolute domination.",
    "A {minutes}-minute win. The enemy team never got a foothold.",
    "Over in {minutes} minutes. That's what total control looks like.",
    "{minutes} minutes. Clinical.",
    "Patron down before they'd finished their first item. Ruthless.",
    "A {minutes}-minute stomp. You were on another level today.",
    "Fast, clean and decisive. Great game.",
    "{minutes} minutes. You didn't give them a single opening.",
    "You snowballed that perfectly from the first fight.",
    "{minutes} minutes and done. Efficient and deadly."
];

// Games over 45 minutes
const LONG_LOSS_LINES = [
    "{minutes} minutes for a loss. That's a long time to be wrong.",
    "{minutes} minutes of effort and nothing to show for it. Relatable.",
    "A {minutes}-minute game and you still lost. Endurance, at least.",
    "{minutes} minutes. You could have watched a movie and lost less.",
    "Everyone was full build and somehow you still made it about you.",
    "{minutes} minutes and the Patron still found a way to go down.",
    "That game took {minutes} minutes and you made every one of them worse.",
    "A {minutes}-minute loss. Somewhere a dinner has gone cold.",
    "Late game was the plan. Losing late was not.",
    "You held on for {minutes} minutes just to lose anyway. Commitment.",
    "The base race went about as well as everything else.",
    "A {minutes}-minute marathon and you finished last."
];

const LONG_WIN_LINES = [
    "{minutes} minutes and you never gave up. That's a win built on grit.",
    "A {minutes}-minute grind, and you came out on top. Brilliant.",
    "{minutes} minutes of pressure and you held your nerve. Well played.",
    "That took {minutes} minutes and your focus never dropped.",
    "Won after {minutes} minutes. You outlasted and outplayed them.",
    "Late game hero. You were clutch when it counted.",
    "{minutes} minutes of hard work, and it paid off.",
    "Long game, deserved win.",
    "A {minutes}-minute win. Huge mental strength in that one.",
    "Full build, full send, and a W. Great finish."
];

// Street Brawl, there aren't any souls here
const BRAWL_LOSS_LINES = [
    "Lost Street Brawl. The mode with no souls and apparently no skill.",
    "A Street Brawl loss. No souls to blame this time.",
    "You lost a brawl. In the street. In front of everyone.",
    "Street Brawl is the casual mode and you still found a way.",
    "You came for a brawl and got a beating.",
    "Street Brawl loss on {hero}. The street won.",
    "{deaths} deaths in Street Brawl. You'd lose a fight with a vending machine.",
    "No farm, no excuses, no win.",
    "You can't blame your build in Street Brawl. Just you.",
    "Street Brawl: lost. Dignity: also lost.",
    "{kills}/{deaths}/{assists} in the warm-up mode. Still cold."
];

const BRAWL_WIN_LINES = [
    "Street Brawl W. You ran that street.",
    "A Street Brawl win on {hero}. Clean fights all round.",
    "Won the brawl. Your mechanics were on point.",
    "{kills} kills in Street Brawl. Fast hands.",
    "Brawl won. You were the best fighter out there.",
    "The street is yours. Earned it.",
    "Good brawl. Sharp aim, smart fights.",
    "Street Brawl champion. Nicely done.",
    "You brought the fight and won every one that mattered.",
    "{kills}/{deaths}/{assists} in Street Brawl. Lovely numbers."
];

const TILT_LINES : Array<[number, string[]]> = [
    [12, [
        "{n} losses in a row. I've stopped finding this funny. I'm lying, it's hilarious.",
        "{n} straight. At this point you're an asset to every enemy team.",
        "{n} in a row. This isn't a losing streak, it's a lifestyle.",
        "{n} straight losses. The matchmaker is running experiments on you.",
        "{n} in a row. Your MMR is in witness protection.",
        "{n} losses back to back. I'm calling someone.",
        "{n} in a row and {losttime} of losing. This is your whole personality now."
    ]],
    [8, [
        "{n} losses in a row. This is a cry for help.",
        "{n} straight losses. At this point the game is playing you.",
        "{n} in a row. Please go outside. Touch grass. Any grass.",
        "{n} in a row. Your rank is on a zipline straight down.",
        "{n} straight. Even the enemy teams feel bad now.",
        "{n} losses back to back. Have you considered a different hobby? Any hobby?",
        "{n} in a row. The Patron sends its condolences.",
        "{n} straight losses. {losttime} lost. Please log off."
    ]],
    [5, [
        "{n} losses in a row. The Steam refund window has closed, sorry.",
        "{n}-game losing streak. Maybe it's not the teammates.",
        "That's {n} in a row. Tilted doesn't begin to describe it.",
        "{n} straight. The definition of insanity is queuing again. Go on.",
        "{n} losses in a row. It's not the matchmaking.",
        "{n} straight Ls. That's not bad luck anymore.",
        "{n} in a row. Someone check on them.",
        "{n} straight, and {losttime} of losing. Go outside."
    ]],
    [3, [
        "{n} in a row. Maybe uninstall?",
        "{n} losses straight. Time for a break, champ.",
        "Losing streak: {n}. Getting warmed up?",
        "That's {n} in a row. A pattern is forming.",
        "{n} losses back to back. Warming up or winding down?",
        "{n} straight. Classic.",
        "{n} straight losses. It's starting to look intentional."
    ]]
];

const WIN_STREAK_LINES : Array<[number, string[]]> = [
    [8, [
        "{n} wins in a row. You're unstoppable right now.",
        "{n} straight. You're genuinely good at this game.",
        "{n}-game win streak. The other lobbies should be worried.",
        "{n} in a row. That's not luck, that's skill."
    ]],
    [5, [
        "{n} in a row. You're in the zone.",
        "{n} straight wins. Keep riding it.",
        "{n}-game win streak. Seriously impressive.",
        "{n} wins back to back. Everything's clicking."
    ]],
    [3, [
        "{n} wins in a row. Heating up.",
        "{n}-game win streak. Momentum's on your side.",
        "{n} straight wins. Nice run.",
        "Win streak: {n}. Keep it going."
    ]]
];

const DERANK_LINES = [
    "And you deranked. Pack your bags.",
    "Deranked! The badge was never really yours anyway.",
    "Rank down. Your old badge is in a better place now.",
    "Demoted. Welcome back to where you belong.",
    "Your rank went down faster than your Walker.",
    "Down to {rank}. Back where you belong.",
    "Welcome to {rank}. Your new home, for now.",
    "Deranked to {rank}. The badge fits better, honestly.",
    "{rank}. Valve has corrected the error.",
    "Down to {rank}. Don't unpack, you might be going further.",
    "Say hello to {rank}. It missed you.",
    "Deranked to {rank}. The climb was nice while it lasted.",
    "{rank} again. Like coming home to a house that's on fire.",
    "Demoted to {rank}. Your new teammates are already sorry.",
    "Down to {rank}. The old badge has been returned to sender."
];

const STREAK_BROKEN_LINES = [
    "Losing streak over after {n} games. Knew you had it in you.",
    "{n} losses, then a win. That's resilience.",
    "{n}-game losing streak broken. Back on track.",
    "After {n} tough games, a well-deserved W.",
    "The {n}-game losing streak is done. Here's to a winning one.",
    "A win after {n} losses. You never stopped pushing.",
    "It took {n} games, but you pushed through. Well done.",
    "{n} losses couldn't keep you down.",
    "Streak broken after {n}. That's the comeback starting.",
    "You bounced back after {n} losses. That takes guts.",
    "{n} losses and you kept showing up. That's how you get here.",
    "The curse is lifted after {n} games. Great game."
];

// Street Brawl first since those games are always short
function situational(ctx : LineContext, won : boolean) {
    if(ctx.mode == 4) return won ? BRAWL_WIN_LINES : BRAWL_LOSS_LINES;
    if(ctx.minutes == null) return undefined;
    if(ctx.minutes < 20) return won ? STOMP_WIN_LINES : STOMP_LOSS_LINES;
    if(ctx.minutes > 45) return won ? LONG_WIN_LINES : LONG_LOSS_LINES;
    return undefined;
}

function matchLine(ctx : LineContext, won : boolean) {
    const hero = HERO_LINES[ctx.hero];
    if(hero && Math.random() < 0.4) return fill(fresh(won ? hero.win : hero.loss, usable(ctx)), ctx);

    const special = situational(ctx, won);
    if(special && Math.random() < 0.4) return fill(fresh(special, usable(ctx)), ctx);

    return fill(fresh(won ? WIN_LINES : LOSS_LINES, usable(ctx)), ctx);
}

export function getInsult(ctx : LineContext) {
    if(Math.random() < 0.15) return filtered(() => insulter.Insult());
    return matchLine(ctx, false);
}

export function getCompliment(ctx : LineContext) {
    if(Math.random() < 0.15) return filtered(() => InsultCompliment.Compliment());
    return matchLine(ctx, true);
}

function tiered(tiers : Array<[number, string[]]>, ctx : LineContext, streak : number) {
    for(const [min, lines] of tiers) {
        if(streak >= min) return fill(fresh(lines, usable(ctx)), ctx, streak);
    }
    return undefined;
}

export const getTiltLine = (ctx : LineContext, streak : number) => tiered(TILT_LINES, ctx, streak);

export const getWinStreakLine = (ctx : LineContext, streak : number) => tiered(WIN_STREAK_LINES, ctx, streak);

// ctx.rank should be the rank they deranked to
export const getDerankLine = (ctx : LineContext) => fill(fresh(DERANK_LINES, usable(ctx)), ctx);

export const getStreakBrokenLine = (ctx : LineContext, streak : number) => fill(fresh(STREAK_BROKEN_LINES), ctx, streak);
