import type { QualityHealth } from "./quality.js";
type Pressure = NonNullable<QualityHealth['cpu']>;
export declare const HANG_MS = 200;
export declare class CallHealthWatch {
    private c;
    private battery?;
    private stops;
    private machineInfo?;
    private static gpu?;
    start(): void;
    stop(): void;
    pressureChanged(state: Pressure, now?: number): void;
    private accountPressure;
    visibilityChanged(hidden: boolean, now?: number): void;
    hung(ms: number): void;
    /**
     * What happened since the last reading, and the counters started over.
     * Only what there is to say, and the machine every time: the relay keeps
     * a side's latest reading alone.
     */
    reading(now?: number): QualityHealth;
    private machine;
    private static gpuName;
}
export {};
