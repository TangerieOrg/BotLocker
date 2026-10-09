// Keyed by the hero name from deadlock-api, so these need to match exactly ("Mo & Krill", "The Doorman")
export interface HeroLines {
    loss: string[];
    win: string[];
    // Prefixed with "Watching " in the status, same as the other presence lines
    presence: string[];
}

export const HERO_LINES : Record<string, HeroLines> = {
    "Infernus": {
        loss: [
            "You set yourself on fire, metaphorically.",
            "Afterburn did more work than your brain did.",
            "You Flame Dashed into the enemy team and burned nothing but your respawn timer.",
            "Concussive Combustion in the middle of nobody. Big boom, zero kills.",
            "You coated them in Napalm and then politely let them leave.",
            "Infernus is supposed to make the enemy team burn, not your team's patience."
        ],
        win: [
            "Burned them down. Smells like a W.",
            "Napalm, Flame Dash, win. Even you can follow that combo."
        ],
        presence: [
            "{name} blow up next to nobody as Infernus",
            "{name} Flame Dash into five people"
        ]
    },
    "Seven": {
        loss: [
            "Seven ult in the open, again. They saw you from orbit.",
            "Your Storm Cloud was a light drizzle.",
            "Static Charge stunned exactly one trooper.",
            "You ulted under a roof. Every single time.",
            "You threw Lightning Balls at them like they were paper planes.",
            "Power Surge on, brain off."
        ],
        win: [
            "Storm Cloud actually hit people for once. Weather's turning.",
            "A Seven ult that landed. Somebody check the sky."
        ],
        presence: [
            "{name} Storm Cloud an empty room",
            "{name} get interrupted mid-ult as Seven"
        ]
    },
    "Vindicta": {
        loss: [
            "You were flying the whole game and still found a way to die.",
            "Your Assassinate shots were reaching for the stars. Literally.",
            "You staked yourself into a corner.",
            "Flight is for repositioning, not sightseeing.",
            "Your crow did more damage than your rifle.",
            "Sniping from max range and somehow still the first to die."
        ],
        win: [
            "An Assassinate hit something. The clouds parted.",
            "You flew around and it worked. Don't ask me how."
        ],
        presence: [
            "{name} miss every Assassinate",
            "{name} fly straight into a Bebop hook"
        ]
    },
    "Lady Geist": {
        loss: [
            "You spent all your health and got nothing back.",
            "Soul Exchange swapped your health with someone who also had none.",
            "You Essence Bombed yourself to death. Efficient.",
            "Life Drain works better when the enemy isn't healthier than you.",
            "Paying health to cast spells only works if the spells hit.",
            "Malice stacks: zero. Self-inflicted damage: maximum."
        ],
        win: [
            "Soul Exchange actually worked. Must be a full moon.",
            "You drained them dry. Spooky. Nice."
        ],
        presence: [
            "{name} Essence Bomb themself to death",
            "{name} Soul Exchange into a worse position"
        ]
    },
    "Abrams": {
        loss: [
            "Shoulder-charged into five people. Classic Abrams.",
            "Seismic Impact into the enemy team, then straight into the respawn timer.",
            "You charged them into a wall. Then you died against the same wall.",
            "Abrams has all the sustain in the world and you still ran out.",
            "Siphon Life siphoned nothing but your team's hope.",
            "Infernal Resilience can't fix your decision-making."
        ],
        win: [
            "Charged in, didn't die. Abrams diff.",
            "Seismic Impact landed on actual enemies. Beautiful."
        ],
        presence: [
            "{name} Shoulder Charge into five enemies",
            "{name} Seismic Impact onto nobody"
        ]
    },
    "Wraith": {
        loss: [
            "Your card trick was making the win disappear.",
            "Project Mind teleported you into the middle of their team. Bold.",
            "Full Auto, full miss.",
            "Telekinesis lifted them up so everyone could watch them get away.",
            "Wraith melts isolated targets. You were the isolated target.",
            "You pulled a card from the deck and it said 'loss'."
        ],
        win: [
            "Card Trick worked. Pick a card, any card. It's a W.",
            "Lifted, slammed, deleted. Magic."
        ],
        presence: [
            "{name} Project Mind into five enemies",
            "{name} Telekinesis someone who gets away"
        ]
    },
    "McGinnis": {
        loss: [
            "Your turrets got more kills than you did.",
            "Spectral Wall cut your team in half. Your team.",
            "Heavy Barrage hit a lot of floor.",
            "You put your turrets wherever the enemy wasn't. Consistent.",
            "Medicinal Specter kept you alive for an extra two seconds. Not enough.",
            "McGinnis builds fortifications. You built excuses."
        ],
        win: [
            "Turrets up, wall down, game won. Engineering.",
            "Your turrets carried. Feel free to share the credit."
        ],
        presence: [
            "{name} drop turrets in an empty lane",
            "{name} wall off their own team as McGinnis"
        ]
    },
    "Paradox": {
        loss: [
            "You swapped yourself into the worst position on the map.",
            "Your Time Wall stopped time. Your brain was already stopped.",
            "Paradoxical Swap into their whole team. Paradoxically dumb.",
            "Pulse Grenade into the void. The void says thanks.",
            "Kinetic Carbine missed. The time stop was for you to reflect.",
            "You can bend time and you still couldn't find the right moment."
        ],
        win: [
            "Swapped them into your team and they died. As designed.",
            "Time Wall, Carbine, win. Time well spent."
        ],
        presence: [
            "{name} swap into the whole enemy team",
            "{name} Time Wall their own team"
        ]
    },
    "Dynamo": {
        loss: [
            "Your Singularity caught zero enemies and three teammates' disappointment.",
            "You Quantum Entangled straight into the enemy team.",
            "Rejuvenating Aurora healed everyone except the scoreboard.",
            "Kinetic Pulse lifted the enemy team's spirits.",
            "Dynamo's whole job is one good ult. You had none.",
            "You channelled Aurora in the open and got deleted mid-heal."
        ],
        win: [
            "Singularity actually caught people. Science works.",
            "Big ult, big win. Dynamo diff."
        ],
        presence: [
            "{name} Singularity zero enemies",
            "{name} heal the enemy team as Dynamo"
        ]
    },
    "Kelvin": {
        loss: [
            "Your ice path led straight to the enemy fountain.",
            "Frozen Shelter around the enemy carry. Thanks, I guess.",
            "Arctic Beam, but the only thing that froze was your brain.",
            "Your Frost Grenades healed the troopers more than the team.",
            "You domed yourself and they just waited outside.",
            "Kelvin is a support and nobody on your team felt supported."
        ],
        win: [
            "Ice Path somewhere useful for once. Cool.",
            "Froze them solid. Icy W."
        ],
        presence: [
            "{name} Ice Path into the enemy base",
            "{name} dome the wrong person as Kelvin"
        ]
    },
    "Haze": {
        loss: [
            "Haze ult and still lost. Impressive in its own way.",
            "Bullet Dance in the middle of five people and danced right out of the game.",
            "You Smoke Bombed past the fight and missed it entirely.",
            "Sleep Dagger put them to sleep. Then you woke them up and died.",
            "Fixation stacks: high. Kill count: low.",
            "Invisible all game and still found by everyone."
        ],
        win: [
            "Bullet Dance actually worked. Let them dance.",
            "Sneaky. Deadly. Unlikely, but deadly."
        ],
        presence: [
            "{name} Bullet Dance into five people",
            "{name} get caught while invisible"
        ]
    },
    "Holliday": {
        loss: [
            "You bounced off the pad and straight into death.",
            "Powder Keg went off in your own face.",
            "Spirit Lasso caught a trooper. Yeehaw.",
            "Crackshot works on heads. You were shooting feet.",
            "You bounced so high you missed the whole fight.",
            "The cowboy fantasy ends here, partner."
        ],
        win: [
            "Lassoed, bounced, headshot. Someone's been watching westerns.",
            "Rootin' tootin' W."
        ],
        presence: [
            "{name} bounce pad into the enemy team",
            "{name} lasso a trooper"
        ]
    },
    "Bebop": {
        loss: [
            "You missed every hook. Every single one.",
            "Hyper Beam is a laser. Pointing it at people is the important part.",
            "You hooked their tank into your backline.",
            "Sticky Bomb stuck to the floor.",
            "Exploding Uppercut sent them flying. Away from your team.",
            "Grapple Arm missed so many times it filed a complaint."
        ],
        win: [
            "A Bebop who hits hooks. Rare footage.",
            "Hook, uppercut, beam, W. Textbook."
        ],
        presence: [
            "{name} miss every hook as Bebop",
            "{name} hook the enemy tank"
        ]
    },
    "Calico": {
        loss: [
            "Nine lives and you used all of them.",
            "Return to Shadows. And stay there next time.",
            "You possessed Ava and still couldn't find a kill.",
            "Gloom Bombs landed somewhere gloomy and empty.",
            "Leaping Slash into the middle of five people. Cat-astrophic.",
            "Calico wreaks havoc from the sidelines. You just sat on them."
        ],
        win: [
            "Cat got their tongue. And their Patron.",
            "Nine lives and you only needed a couple."
        ],
        presence: [
            "{name} use up all nine lives",
            "{name} hide in the shadows as Calico"
        ]
    },
    "Grey Talon": {
        loss: [
            "Your arrows had the accuracy of a stormtrooper.",
            "Your Guided Owl flew into a wall.",
            "Rain of Arrows: you, hovering in the air like a target.",
            "Spirit Snare trapped nothing but your own team.",
            "Charged Shot charged up. Missed. Charged up again. Missed again.",
            "You were supposed to be the sniper, not the snipee."
        ],
        win: [
            "The owl hit. Grey Talon fans rejoice.",
            "Arrows landed, prey hunted. Nice."
        ],
        presence: [
            "{name} fly their owl into a wall",
            "{name} miss Charged Shots from a mile away"
        ]
    },
    "Mo & Krill": {
        loss: [
            "You combo'd yourself into the fountain.",
            "Burrowed in, popped out, got deleted.",
            "Your Combo held them in place while your team ran away.",
            "Sand Blast disarmed the enemy and your team's trust.",
            "You spun around underground and came up in the wrong postcode.",
            "Two of you and neither knew what to do."
        ],
        win: [
            "Combo'd them into oblivion. Krill's proud of you.",
            "Burrow, Combo, win. Both of you did great."
        ],
        presence: [
            "{name} burrow into the enemy team",
            "{name} Combo someone while their team dies"
        ]
    },
    "Shiv": {
        loss: [
            "Rage meter full, impact empty.",
            "Killing Blow didn't kill anyone. Just a blow, then.",
            "Bloodletting delayed the damage. Didn't delay the death.",
            "Slice and Dice sliced you up instead.",
            "Your knives found everyone except heroes.",
            "Shiv plays dirty. You just played badly."
        ],
        win: [
            "Shiv plays dirty and so did you. Nice.",
            "The Killing Blows actually killed. Stabby W."
        ],
        presence: [
            "{name} Slice and Dice into a loss",
            "{name} sit on full rage as Shiv"
        ]
    },
    "Ivy": {
        loss: [
            "You carried your teammate straight into the enemy team.",
            "Air Drop: fly your ally to their death. Very teamwork.",
            "Kudzu Connection linked you to someone who also died.",
            "Stone Form. Rock solid. Rock smart.",
            "Entangling Thorns caught more troopers than heroes.",
            "Your ally trusted you. Big mistake."
        ],
        win: [
            "Air Dropped your ally on their heads. Delivery complete.",
            "Power duo activated. You were the duo."
        ],
        presence: [
            "{name} Air Drop a teammate into five enemies",
            "{name} turn to stone and do nothing"
        ]
    },
    "Warden": {
        loss: [
            "You were supposed to be the one locking people up.",
            "Binding Word, and they just walked away.",
            "Last Stand was literally your last stand.",
            "Your flasks missed more than they hit.",
            "Willpower can't fix the decisions.",
            "Warden leads from the front. You led the funeral procession."
        ],
        win: [
            "Locked them up and threw away the key.",
            "Binding Word landed. Justice is served."
        ],
        presence: [
            "{name} Last Stand in the wrong spot",
            "{name} get locked up as Warden"
        ]
    },
    "Yamato": {
        loss: [
            "Shadow Transformation and you still died. Some samurai.",
            "Power Slash fully charged, fully missed.",
            "Flying Slash, flying straight into death.",
            "Crimson Slash painted the floor crimson. With you.",
            "Yamato is meant to make every hit count. You made every death count.",
            "You brought a sword to a gunfight and forgot to swing it."
        ],
        win: [
            "Power Slash connected. The blade is sharp today.",
            "Shadow Transformation into a W. Honour restored."
        ],
        presence: [
            "{name} miss a fully charged Power Slash",
            "{name} Flying Slash into five people"
        ]
    },
    "Lash": {
        loss: [
            "Your ground strikes hit the ground. That's about it.",
            "Death Slam: you got the death bit right.",
            "Grappled in, nobody followed, nobody survived. Mostly you.",
            "Flog heals you for the damage you deal. So, nothing.",
            "You dove from the sky and landed on the respawn timer.",
            "Lash gives enemies no room to breathe. You gave them plenty."
        ],
        win: [
            "Death Slam on five. Delicious.",
            "You dove from the sky and actually landed on something useful."
        ],
        presence: [
            "{name} Death Slam nobody",
            "{name} Ground Strike the ground"
        ]
    },
    "Viscous": {
        loss: [
            "You rolled into the enemy base and never rolled back.",
            "Cubed your teammate right as they were escaping. Thanks.",
            "Puddle Punch punched air.",
            "Splatter splattered. You splattered harder.",
            "You're made of goo and you still crumbled.",
            "The Cube saved one teammate. The other five weren't so lucky."
        ],
        win: [
            "Goo Ball through the backline. Disgusting. Brilliant.",
            "Cubed, punched, won. Gooey W."
        ],
        presence: [
            "{name} goo ball into the enemy base",
            "{name} cube the wrong teammate"
        ]
    },
    "Pocket": {
        loss: [
            "You hid in your suitcase and the team lost anyway.",
            "Flying Cloak teleported you to the worst possible spot.",
            "Barrage, channelled straight into their crosshairs.",
            "Affliction is non-lethal. So were you.",
            "Pocket infiltrates the backline. You infiltrated the respawn room.",
            "Your suitcase saw more of the game than you did."
        ],
        win: [
            "In and out of the suitcase, out with a W.",
            "Barrage landed. Somebody packed for victory."
        ],
        presence: [
            "{name} hide in a suitcase as Pocket",
            "{name} cloak into the enemy team"
        ]
    },
    "Mirage": {
        loss: [
            "Your Djinn's Mark found nobody. Neither did you.",
            "Traveler teleported you to the scene of your own death.",
            "Dust Devil spun you straight into the enemy team.",
            "Fire Scarabs stole life. Not nearly enough of it.",
            "Mirage. Because your impact was an illusion.",
            "You Travelered across the map just to die there instead."
        ],
        win: [
            "The djinn marked them and you finished them. Smooth.",
            "A Mirage W. Real this time."
        ],
        presence: [
            "{name} Traveler into a loss",
            "{name} Dust Devil into five people"
        ]
    },
    "Vyper": {
        loss: [
            "Slithered into the backline and got stepped on.",
            "Lethal Venom wasn't lethal. You were, to your own team.",
            "Your Petrifying Bola petrified nobody.",
            "Screwjab Dagger. Screwed, anyway.",
            "Slither up hills, slide into a loss.",
            "Vyper is meant to assassinate the backline, not get assassinated by it."
        ],
        win: [
            "Slithered in, venom out, W. Snake behaviour.",
            "Petrified them. Sssssuccess."
        ],
        presence: [
            "{name} slide into the enemy backline as Vyper",
            "{name} miss every bola"
        ]
    },
    "Sinclair": {
        loss: [
            "The Magnificent Sinclair. Not so magnificent today.",
            "Rabbit Hex turned them into rabbits and you still couldn't catch them.",
            "Audience Participation copied an ult worse than your own.",
            "Your Spectral Assistant quit halfway through the show.",
            "Vexing Bolt vexed nobody.",
            "For your next trick, you'll make your rank disappear."
        ],
        win: [
            "Ta-da. The Patron has vanished.",
            "Rabbit Hex into a W. The audience applauds."
        ],
        presence: [
            "{name} pull a loss out of a hat",
            "{name} hex the enemy into rabbits and lose anyway"
        ]
    },
    "Mina": {
        loss: [
            "Sanguine Retreat. Mostly the retreat part.",
            "Love Bites. They didn't love it, but they didn't die either.",
            "Nox Nostra sent the bats. The bats came back empty.",
            "You dispersed into bats and reformed as a death.",
            "Mina drains the life out of people. Usually the enemy.",
            "Your bats got more done than you did."
        ],
        win: [
            "Bats out, blood in, W.",
            "Love Bites. The enemy team felt the love."
        ],
        presence: [
            "{name} bat their way into a loss",
            "{name} Sanguine Retreat from the whole game"
        ]
    },
    "Drifter": {
        loss: [
            "Eternal Night, and they still saw you coming.",
            "Stalker's Mark marked someone. Then they stalked you.",
            "Rend tore through nobody.",
            "The dark is your friend. Your aim isn't.",
            "You drift in at night and leave in a coffin.",
            "Bloodscent smelled blood. Yours."
        ],
        win: [
            "Eternal Night. Lights out for the enemy team.",
            "Stalked, marked, rended. Scary. Good."
        ],
        presence: [
            "{name} drift into a loss",
            "{name} Eternal Night with nobody around"
        ]
    },
    "Venator": {
        loss: [
            "Ira Domini: three stakes, zero hits.",
            "Gutshot pushed them back to safety.",
            "Your Snap Trap snapped shut on nothing.",
            "Consecrating Grenade bounced away from the fight like it had better plans.",
            "A monster hunter who became the hunted.",
            "The final stake was blessed. Your aim wasn't."
        ],
        win: [
            "Staked them. Monster hunting season is open.",
            "Ira Domini hit. Blessed W."
        ],
        presence: [
            "{name} miss every stake as Venator",
            "{name} Gutshot someone to safety"
        ]
    },
    "Victor": {
        loss: [
            "Pain Battery fully charged. Pain is right.",
            "Shocking Reanimation brought you back just to die again.",
            "Aura of Suffering hurt you more than them. Fitting.",
            "Jumpstart, then jump straight into the respawn timer.",
            "Victor thrives on pain. You thrived on dying.",
            "Reanimated, re-fed, re-lost."
        ],
        win: [
            "It's alive! And so is your win rate.",
            "Pain Battery discharged into a W."
        ],
        presence: [
            "{name} reanimate just to die again",
            "{name} Jumpstart into five enemies"
        ]
    },
    "Paige": {
        loss: [
            "Bookwyrm flew off into the distance. So did the game.",
            "Plot Armor on a teammate who died anyway. Bad writing.",
            "Rallying Charge across the whole city and still nobody won.",
            "Captivating Read. The enemy wasn't captivated.",
            "This story had a bad ending.",
            "You read the room wrong. All game."
        ],
        win: [
            "Happy ending. The Patron died.",
            "Rallying Charge, Bookwyrm, W. A real page-turner."
        ],
        presence: [
            "{name} write a tragedy as Paige",
            "{name} Plot Armor a teammate who dies anyway"
        ]
    },
    "The Doorman": {
        loss: [
            "Your Doorway led straight to the enemy fountain.",
            "Hotel Guest sent someone away and they came back angrier.",
            "Luggage Cart full of your own baggage.",
            "Call Bell. Nobody answered.",
            "You held the door open for the enemy team.",
            "Checked out early. As usual."
        ],
        win: [
            "Checked them into the Baroness Hotel. Permanently.",
            "Five-star service. The enemy team rated it one."
        ],
        presence: [
            "{name} hold the door for the enemy team",
            "{name} check out early as the Doorman"
        ]
    },
    "Billy": {
        loss: [
            "Bashdown pulled them in. Then they beat you up.",
            "Rising Ram, falling rank.",
            "Chain Gang chained you to a loss.",
            "Swung a bat at the game and missed.",
            "Billy is a punk. You're a liability.",
            "Rammed into their team and stayed there. Forever."
        ],
        win: [
            "Chain Gang dragged them all down. Punk rock W.",
            "Bat swung, heads rung, game won."
        ],
        presence: [
            "{name} Rising Ram into five enemies",
            "{name} chain the whole enemy team and die"
        ]
    },
    "Graves": {
        loss: [
            "The Jar of Dead is meant to fill up with enemies, not your team.",
            "Grasping Hands grasped at nothing.",
            "Your ghouls had more presence than you.",
            "Essence Theft stole nothing worth having.",
            "Graves spends the game surrounded by death. Mostly yours.",
            "You dug your own grave this time."
        ],
        win: [
            "The Jar of Dead is full. Of them.",
            "Grave robbed the enemy team. Respectfully."
        ],
        presence: [
            "{name} dig their own grave",
            "{name} fill the Jar of Dead with teammates"
        ]
    },
    "Apollo": {
        loss: [
            "Riposte timed perfectly. For the wrong attack.",
            "Flawless Advance. Flawlessly into five people.",
            "Itani Lo Sahn: a slow motion replay of your loss.",
            "Disengaging Sigil was the only good decision you made.",
            "Apollo is all about timing. You're all about dying.",
            "A duelist who forgot how to duel."
        ],
        win: [
            "Riposte, advance, slash, W. Elegant.",
            "Flawless? No. But a win."
        ],
        presence: [
            "{name} Riposte nothing",
            "{name} Flawless Advance into a wall"
        ]
    },
    "Rem": {
        loss: [
            "Naptime. Clearly you've been having one all match.",
            "Pillow Toss: soft damage, soft player.",
            "Your Lil Helpers did more than you did.",
            "Tag Along with an ally who died anyway.",
            "You slept through the whole game. Very on brand.",
            "Sweet dreams. Your team had nightmares."
        ],
        win: [
            "Naptime for the enemy team.",
            "Pillow fight won. Somehow."
        ],
        presence: [
            "{name} nap through another loss",
            "{name} pillow fight a Patron"
        ]
    },
    "Silver": {
        loss: [
            "Lycan Curse kicked in and you still lost the fight.",
            "Boot Kick kicked nobody.",
            "Slam Fire fired. Missed.",
            "Entangling Bola entangled your own feet.",
            "Silver bullets didn't help.",
            "Full bloodlust, no blood spilled."
        ],
        win: [
            "Wolfed them down.",
            "Lycan Curse into a W. Howl about it."
        ],
        presence: [
            "{name} go full werewolf and still lose",
            "{name} Boot Kick nobody as Silver"
        ]
    },
    "Celeste": {
        loss: [
            "Light Eater. The enemy team ate you.",
            "Dazzling Trick broke and dazzled no one.",
            "Radiant Daggers. Radiantly missed.",
            "Shining Wonder. Wondering where you were all game.",
            "You were the only light that went out.",
            "Star-crossed with losing."
        ],
        win: [
            "Shining Wonder found its target. You're a star. Briefly.",
            "Light Eater fed well tonight."
        ],
        presence: [
            "{name} dazzle nobody as Celeste",
            "{name} Shining Wonder into a wall"
        ]
    },
    "Rat King": {
        loss: [
            "Rule, Ratannia! The rats have abandoned ship.",
            "Rat Swarm. A swarm of disappointment.",
            "Royal Pestments, royal flop.",
            "You're the king of the rats and the rats lost.",
            "Scrap Grenade, scrap game.",
            "Long live the king. Shame about the king."
        ],
        win: [
            "Rule, Ratannia! The kingdom thrives.",
            "The rats have taken the Patron."
        ],
        presence: [
            "{name} rule over a kingdom of losses",
            "{name} lead the rats into defeat"
        ]
    },
    "Baba": {
        loss: [
            "Feed The Birds. You fed the enemy team instead.",
            "Granny Long Legs ran right into the enemy team.",
            "Baba's Brew went cold.",
            "Threadsap sapped nothing.",
            "Even the pigeons gave up on you.",
            "Grandma would be disappointed."
        ],
        win: [
            "Baba's Brew was just right.",
            "The pigeons have spoken. W."
        ],
        presence: [
            "{name} feed the birds as Baba",
            "{name} brew a loss as Baba"
        ]
    }
};
