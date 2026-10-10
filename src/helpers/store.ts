// Just the parts of a global-store Store the helpers need, so any store fits regardless of its actions.
// The state type comes from get, subscribe's overloads throw off inference
export interface Watchable<S> {
    get() : S;
    // deno-lint-ignore no-explicit-any
    subscribe(selector : (state : any) => unknown, cb : (cur : any, prev : any) => void) : () => void;
}

type Callback<R> = (cur : R, prev : R | undefined) => void;

// subscribe, but also runs straight away with what's there now (prev is undefined that first time)
export function watch<S, R>(store : Watchable<S>, selector : (state : S) => R, cb : Callback<R>) {
    cb(selector(store.get()), undefined);
    return store.subscribe(selector, cb as (cur : R, prev : R) => void);
}

// Value worked out from several stores, cb only runs when it actually changes
// deno-lint-ignore no-explicit-any
export function watchAll<R>(stores : Watchable<any>[], compute : () => R, cb : Callback<R>, equals : (a : R, b : R) => boolean = Object.is) {
    let prev = compute();
    cb(prev, undefined);

    const update = () => {
        const cur = compute();
        if(equals(cur, prev)) return;
        const last = prev;
        prev = cur;
        cb(cur, last);
    };

    const unsubs = stores.map(x => x.subscribe(s => s, update));
    return () => unsubs.forEach(x => x());
}

export const setEquals = <T,>(a : ReadonlySet<T>, b : ReadonlySet<T>) => a.size == b.size && [...a].every(x => b.has(x));

export function diffSet<T>(cur : ReadonlySet<T>, prev : ReadonlySet<T> = new Set()) {
    return {
        added: [...cur].filter(x => !prev.has(x)),
        removed: [...prev].filter(x => !cur.has(x))
    };
}

// Keys that are new or now hold a different value, and keys that are gone
export function diffMap<K, V>(cur : ReadonlyMap<K, V>, prev : ReadonlyMap<K, V> = new Map()) {
    return {
        changed: [...cur].filter(([k, v]) => prev.get(k) !== v),
        removed: [...prev.keys()].filter(k => !cur.has(k))
    };
}
