import type { Room } from "@wordplus/rtc-client";
import type { SendingStats } from "./playback-types.js";
export declare class SendingReader {
    private readonly now;
    private before;
    constructor(now?: () => number);
    read(room: Room): Promise<SendingStats | null>;
    private picture;
    private sound;
    private rates;
    private transportOut;
}
