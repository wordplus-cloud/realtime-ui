export declare function viewStep(height: number): number;
export declare class ElementViewTracker {
    private readonly onChange;
    private readonly exact;
    private readonly watched;
    private resizeObserver;
    private intersectionObserver;
    private visibilityListener;
    private closed;
    constructor(onChange: () => void, exact?: boolean);
    observe(element: HTMLMediaElement): void;
    unobserve(element: HTMLMediaElement): void;
    stale(): HTMLMediaElement[];
    wantedHeight(): number;
    private visibleHeight;
    private changed;
    close(): void;
}
