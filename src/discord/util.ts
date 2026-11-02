import type { ChatInputCommandInteraction, Client } from "discord.js";
import { OWNER_ID } from "../config.ts";

// Bot application owner, or OWNER_ID if set
export async function isOwner(interaction : ChatInputCommandInteraction) {
    if(OWNER_ID) return interaction.user.id == OWNER_ID;

    const owner = (await interaction.client.application.fetch()).owner;
    if(!owner) return false;
    return "members" in owner ? owner.members.has(interaction.user.id) : owner.id == interaction.user.id;
}

// Same owner as isOwner, for when there's no interaction to check against
export async function getOwnerId(client : Client) {
    if(OWNER_ID) return OWNER_ID;

    const owner = (await client.application?.fetch())?.owner;
    if(!owner) return undefined;
    return "members" in owner ? owner.ownerId ?? undefined : owner.id;
}
