import { type Rooms, type RoomsOptions } from './rooms.js';
/** The package on the page, for a product's code. */
export declare const GLOBAL = "wordplusRealtimeClient";
/**
 * The page's rooms, made once from the server package's settings (`window.wordplusRealtimeConfig`, wordplus/realtime's
 * script()): what every plugin's code and the call screen share on a WordPress page, so the page is one tab on the
 * connection and a call rings once. Null on a page without the settings (a site without credentials).
 */
export declare function page(config?: RoomsOptions): Rooms | null;
