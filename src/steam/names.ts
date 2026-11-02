import { setSteamName } from "../db/mod.ts";
import { diffMap, watchAll } from "../helpers/store.ts";
import { LinkStore, linkedAccounts } from "../links/LinkStore.ts";
import { SteamStore } from "./SteamStore.ts";

// Persona names of linked accounts, only changes are written
function linkedNames() {
    const { personas } = SteamStore.get();
    const names = new Map<number, string>();
    for(const id of linkedAccounts()) {
        const persona = personas.get(id);
        if(persona) names.set(id, persona.name);
    }
    return names;
}

export function startSteamNames() {
    watchAll([SteamStore, LinkStore], linkedNames, async (cur, prev) => {
        try {
            for(const [id, name] of diffMap(cur, prev).changed) await setSteamName(id, name);
        } catch(err) {
            console.error("[Steam] Couldn't save persona names", err);
        }
    }, (a, b) => diffMap(a, b).changed.length == 0);
}
