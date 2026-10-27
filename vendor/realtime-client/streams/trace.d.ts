export declare class StreamTrace {
    private readonly send;
    private readonly now;
    private lines;
    private written;
    private dropped;
    private lastSent;
    private timer;
    private readonly start;
    constructor(send: (lines: string[]) => void, now?: () => number);
    add(line: string): void;
    flush(): void;
    stop(): void;
    private stamped;
    private schedule;
}
