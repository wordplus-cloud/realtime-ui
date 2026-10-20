/** The page's keyring, shared by every copy of this package on it. */
export declare const KEYRING_GLOBAL = "wordplusRealtimeKeyring";
/** Where a key came from: what a listener tells apart, so a key doesn't go back where it came from. */
export type KeySource = 'page' | 'site' | 'worker' | 'event' | (string & {});
/** Asks for keys the keyring doesn't hold and adds those it gets; resolves either way. */
export type KeyResolver = (labels: string[]) => Promise<void>;
export type KeysListener = (entries: string[], source: KeySource) => void;
export declare function validLabel(label: unknown): label is string;
/** The label of the key that opens a sealed value, or null when it is none. */
export declare function labelOf(value: unknown): string | null;
export declare function isSealed(value: unknown): value is string;
export declare class Keyring {
    /** What a newer copy of the package checks before it uses a keyring an older one made. */
    readonly version = 1;
    private readonly keys;
    private readonly listeners;
    private resolver;
    private readonly inFlight;
    private readonly refused;
    private batch;
    /**
     * Keys as the site hands them out, one or a list. Returns those the keyring didn't hold, after telling the
     * listeners about them.
     */
    add(entries: unknown, source?: KeySource): string[];
    has(label: string): boolean;
    /** Every key held, as entries: what a worker is handed when a tab connects to it. */
    entries(): string[];
    onAdded(listener: KeysListener): () => void;
    /**
     * A sealed value opened, or null when no key held opens it. Anything not sealed comes back as it is: a site
     * that doesn't seal, a REST answer's plain text.
     */
    open(value: string): string | null;
    /** A sealed value's JSON, parsed; a value not sealed comes back as it is, and one that doesn't open as undefined. */
    openJson(value: unknown): unknown;
    /** A value sealed with a label's key, or null when the keyring doesn't hold it. */
    seal(value: string, label: string): string | null;
    sealJson(data: unknown, label: string): string | null;
    /**
     * The newest key held of one thing, by its label up to the generation (`c:12:`, `u:5:`, `ch:private-a:`):
     * what to seal with. Null when none is held.
     */
    newest(prefix: string): string | null;
    /** Today's day key (UTC), or the newest held when the keyring has none for today. */
    dayLabel(now?: number): string | null;
    /** The labels of the sealed values in a payload whose keys the keyring doesn't hold. */
    missing(value: unknown): string[];
    /** How a context asks for keys it misses: the site's route from a page, a tab from a worker. */
    setResolver(resolver: KeyResolver | null): void;
    hasResolver(): boolean;
    /**
     * Makes sure the keyring holds these keys, asking the resolver once for those it doesn't. Labels asked for in
     * the same moment go in one request, one already asked for waits for that request, and one asked for in vain
     * isn't asked for again for a minute. Resolves either way: a value whose key never comes stays sealed.
     */
    ensure(labels: Iterable<string>): Promise<void>;
    /** Forgets every key: another user signing in, a local database reset. */
    clear(): void;
}
/**
 * The page's keyring, one for every plugin and every copy of this package on it: the first copy makes it, and the
 * others take it while it is one they know (its `version`). In a worker, the worker's.
 */
export declare function keyring(): Keyring;
/** Calls `visit` with every value in a payload, `DEPTH` levels deep. */
export declare function walk(value: unknown, depth: number, visit: (item: unknown, key: string) => void): void;
