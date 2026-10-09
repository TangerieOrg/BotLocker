import { asDbFunction, now, stmt } from "./connection.ts";
import type { Link } from "./types.ts";

export const getLink = asDbFunction((db, userId : string) =>
    stmt(db, "SELECT * FROM links WHERE user_id = ?", s => s.get(userId)) as Link | undefined);

export const getLinkByAccount = asDbFunction((db, accountId : number) =>
    stmt(db, "SELECT * FROM links WHERE account_id = ?", s => s.get(accountId)) as Link | undefined);

export const getLinks = asDbFunction(db => stmt(db, "SELECT * FROM links", s => s.all()) as unknown as Link[]);

export const setLink = asDbFunction((db, userId : string, accountId : number) => stmt(db, `--sql
    INSERT INTO links (user_id, account_id, linked_at) VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET account_id = excluded.account_id, linked_at = excluded.linked_at
`, s => s.run(userId, accountId, now())));

export const removeLink = asDbFunction((db, userId : string) =>
    stmt(db, "DELETE FROM links WHERE user_id = ?", s => s.run(userId)) > 0);
