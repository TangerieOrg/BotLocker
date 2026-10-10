import { LinkStore, linkedAccounts } from "../links/LinkStore.ts";
import { diffSet, setEquals, watchAll } from "../helpers/store.ts";
import { addFriend } from "./client.ts";
import { Relationship, SteamStore } from "./SteamStore.ts";

// Anyone who adds the bot gets accepted (so they can /link after), and linked players it has no relationship with get invited
function wanted() {
    const { login, relations, relationsLoaded, limited } = SteamStore.get();
    if(login.state != "loggedOn" || !relationsLoaded) return new Set<number>();

    const ids = [...relations].filter(([, rel]) => rel == Relationship.RequestRecipient).map(([id]) => id);
    if(!limited) ids.push(...[...linkedAccounts()].filter(id => !relations.has(id)));
    return new Set(ids);
}

// Only newly wanted accounts get a request, so a failed one isn't retried until the relationship changes
export function startFriends() {
    watchAll([SteamStore, LinkStore], wanted, (cur, prev) => {
        for(const id of diffSet(cur, prev).added) addFriend(id);
    }, setEquals);
}
