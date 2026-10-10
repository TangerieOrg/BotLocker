import { asDbFunction } from "./connection.ts";

export const getKv = asDbFunction((db, key : string) => {
    using stmt = db.prepare<{ value: string }>("SELECT value FROM kv WHERE key = ?");
    return stmt.get(key)?.value;
});

export const setKv = asDbFunction((db, key : string, value : string | null) => {
    if(value == null) {
        db.exec("DELETE FROM kv WHERE key = ?", key);
    } else {
        db.exec("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
    }
});
