import { startAnnouncer } from "./announce/effects.ts";
import { startDbServer } from "./db/server.ts";
import { startDiscord } from "./discord/client.ts";
import { startNameSync } from "./discord/nameSync.ts";
import { startGuardNotice } from "./discord/guard.ts";
import { startPresence } from "./discord/presence.ts";
import { startSalts } from "./salts/effects.ts";
import { startSteam } from "./steam/client.ts";
import { startFriends } from "./steam/friends.ts";
import { startSteamNames } from "./steam/names.ts";
import { startAssets } from "./deadlock/assets.ts";
import { startTracker } from "./tracker/effects.ts";

// Everything reacts to the stores from here on, the logins just get the state moving
startFriends();
startTracker();
startAnnouncer();
startGuardNotice();
startPresence();
startNameSync();
startSteamNames();
startAssets();
startSalts();
startDbServer();

startSteam();
await startDiscord();
