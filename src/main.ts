import { startAnnouncer } from "./announce/effects.ts";
import { startDiscord } from "./discord/client.ts";
import { startGuardNotice } from "./discord/guard.ts";
import { startPresence } from "./discord/presence.ts";
import { startSteam } from "./steam/client.ts";
import { startFriends } from "./steam/friends.ts";
import { startTracker } from "./tracker/effects.ts";

// Everything reacts to the stores from here on, the logins just get the state moving
startFriends();
startTracker();
startAnnouncer();
startGuardNotice();
startPresence();

startSteam();
await startDiscord();
