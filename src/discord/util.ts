import type { APIEmbed, ChatInputCommandInteraction, Client, Guild, GuildMember } from "discord.js";
import { getLink, getNotifyGuilds, type Link } from "../db/mod.ts";
import { errorEmbed } from "./embeds.ts";
import { OWNER_ID } from "../config.ts";

export async function getTargetLink(interaction : ChatInputCommandInteraction) : Promise<{ link?: Link, error?: APIEmbed }> {
    const user = interaction.options.getUser("user");
    if(user?.bot) return { error: errorEmbed("Invalid User", "They must not be a bot") };

    const link = await getLink((user ?? interaction.user).id);
    if(!link) {
        return {
            error: user ?
                errorEmbed("No Deadlock account linked to user") :
                errorEmbed("Deadlock Account Not Linked", "Run /link to link")
        };
    }

    return { link };
}

export async function fetchMembers(guild : Guild, userIds : string[]) {
    const members = new Map<string, GuildMember>();
    await Promise.all(userIds.map(id =>
        guild.members.fetch(id).then(x => members.set(id, x)).catch(() => undefined)
    ));
    return members;
}

// For places with no server of their own (bot status, logs). Prefers servers with a notify channel
export async function memberName(client : Client, userId : string) {
    const notify = new Set((await getNotifyGuilds()).map(x => x.guild_id));
    const guilds = [...client.guilds.cache.values()].sort((a, b) => Number(notify.has(b.id)) - Number(notify.has(a.id)));

    for(const guild of guilds) {
        const member = await guild.members.fetch(userId).catch(() => undefined);
        if(member) return member.displayName;
    }

    return await client.users.fetch(userId).then(x => x.displayName).catch(() => "someone");
}

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
