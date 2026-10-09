import { getRank } from "../deadlock/api.ts";
import { getLatestBadge } from "../db/mod.ts";

// deadlock-api knows their current rank, otherwise fall back to the badge going into their latest ranked match
export async function getCurrentRank(accountId : number) {
    return (await getRank(accountId).catch(() => undefined))?.badge || await getLatestBadge(accountId);
}
