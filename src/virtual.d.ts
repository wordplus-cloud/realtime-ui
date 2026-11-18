// The elements' stylesheet, which the build compiles and hands the elements entry as text.
declare module "virtual:elements-css" {
    const css: string;
    export default css;
}

// The live streams' stylesheet (streams.css), which the build hands the stream elements entry as text.
declare module "virtual:streams-css" {
    const css: string;
    export default css;
}

// The recording player's stylesheet (recording.css), which the build hands the recording element's entry as text.
declare module "virtual:recording-css" {
    const css: string;
    export default css;
}
