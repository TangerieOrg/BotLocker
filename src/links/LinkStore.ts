import { createStore } from "@tangerie/global-store/store";
import { getLinks, removeLink, setLink } from "../db/mod.ts";
import { diffMap } from "../helpers/store.ts";

interface LinkState {
    // Discord user → Deadlock account
    links: Map<string, number>;
}

export const LinkStore = createStore({
    state: { links: new Map((await getLinks()).map(x => [x.user_id, x.account_id])) } as LinkState,
    actions: {
        link: (s, userId : string, accountId : number) => { s.links.set(userId, accountId) },
        unlink: (s, userId : string) => { s.links.delete(userId) }
    }
});

export const { link, unlink } = LinkStore.actions;

// Everything reads the store, the database just follows it. Removals first since account_id is unique
LinkStore.subscribe(s => s.links, async (cur, prev) => {
    const { changed, removed } = diffMap(cur, prev);
    try {
        for(const userId of removed) await removeLink(userId);
        for(const [userId, accountId] of changed) await setLink(userId, accountId);
    } catch(err) {
        console.error("[Links] Couldn't save links", err);
    }
});

export const getAccount = LinkStore.selector((s, userId : string) => s.links.get(userId));

export const getUser = LinkStore.selector((s, accountId : number) => [...s.links].find(([, id]) => id == accountId)?.[0]);

export const linkedAccounts = LinkStore.selector(s => new Set(s.links.values()));
