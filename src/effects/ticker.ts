// A steady beat for processing frames, from a worker: a page's own timers run once a second while its tab is in the
// background, and a call goes on there (someone looks at another tab), so its camera would drop to a frame a second.
// A worker's timers keep their pace. Where the page may start no worker of its own (a content security policy without
// blob:), the page's timers do, at the pace the browser allows.

const SOURCE = "let t=0;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}";

export interface Ticker {
    stop(): void,
}

export function tick( every: number, run: () => void ): Ticker {
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let url = "";
    let stopped = false;

    const fallBack = () => {
        worker?.terminate();
        worker = null;
        if ( ! stopped && ! timer ) timer = setInterval( run, every );
    };

    try {
        url = URL.createObjectURL( new Blob( [ SOURCE ], { type: "text/javascript" } ) );
        worker = new Worker( url );
        worker.onmessage = run;
        worker.onerror = fallBack;
        worker.postMessage( every );
    } catch {
        fallBack();
    }

    return {
        stop() {
            stopped = true;
            worker?.terminate();
            worker = null;
            if ( timer ) clearInterval( timer );
            timer = null;
            if ( url ) URL.revokeObjectURL( url );
        },
    };
}
