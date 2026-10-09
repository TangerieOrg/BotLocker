import { asDbFunction, stmt } from "./connection.ts";

export const getKv = asDbFunction((db, key : string) =>
    (stmt(db, "SELECT value FROM kv WHERE key = ?", s => s.get(key)) as { value: string } | undefined)?.value);

export const setKv = asDbFunction((db, key : string, value : string | null) => value == null ?
    stmt(db, "DELETE FROM kv WHERE key = ?", s => s.run(key)) :
    stmt(db, "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", s => s.run(key, value)));
