import { now } from "../helpers/now.ts";
import { asDbFunction } from "./connection.ts";
import type { Link } from "./types.ts";

export const getLinks = asDbFunction(db => {
    using stmt = db.prepare<Link>("SELECT * FROM links");
    return stmt.all();
});

export const setLink = asDbFunction((db, userId : string, accountId : number) => {
    db.exec(`--sql
        INSERT INTO links (user_id, account_id, linked_at) VALUES (?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET account_id = excluded.account_id, linked_at = excluded.linked_at
    `, userId, accountId, now());
});

export const removeLink = asDbFunction((db, userId : string) => {
    db.exec("DELETE FROM links WHERE user_id = ?", userId);
});
