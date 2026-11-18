import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {CallContext, CallContextInterface, type CallParticipant} from "./context.ts";
import GroupVideoGridItem from "./group-video-grid-item.tsx";
import useStateRef from "../../inc/hooks/state-ref.ts";
import {isMobile} from "../../inc/functions/browser-info.ts";
import {applyFilters} from "../../inc/globals.ts";
import {DEFAULT_TILE_RATIO, TALL_TILE_RATIO, fillsBox, participantRatio} from "../../inc/calls/ratio.ts";
import { PeopleColumnContext } from "./people-panel.tsx";
import { PinsContext, spotlitKeys } from "./spotlight.tsx";
import { HiddenSound, LayoutChoiceContext, PageArrows, StageNote, emptyStage, hasPicture, layoutMainKeys, useSpeakerFocus, useVoiced, visibleTiles } from "./layout-choice.tsx";
import useGridMoves from "./grid-moves.ts";

/**
 * This grid tells the context's showTiles which tiles it draws: whoever runs the call may receive only their cameras,
 * where screens from before it (which never tell) needed everything received.
 */
export const SHOWS_TILES = true;

type GroupVideoPositionItem = { x: number; y: number; width: number; height: number }
type GroupVideoPositions = Map<string, GroupVideoPositionItem>

// A phone or a tablet (isMobile): a camera fills its tile only when that cuts at most FILL_CUTS_MOST of it (ratio.ts),
// the two all but the same shape, and is drawn whole otherwise, as a shared screen always is. The search for the grid
// weighs each arrangement by how big it draws the pictures of the first page, each whole in its cell, so the cells
// take the cameras' shapes: those of phones a grid of two columns, those of computers wide rows. A page holds
// TOUCH_PAGE_MOST, the user's own tile among the others as on a computer, and the pages swipe.
const TOUCH_PAGE_MOST = { phone: 6, tablet: 16 };
// A cell longer than this one way or the other is a strip, which draws a picture worse than its area says.
const STRIP_SHAPE = 2.4;

const phoneSized = () => typeof window !== 'undefined' && Math.min( window.innerWidth, window.innerHeight ) < 600;

/** What a cell longer than STRIP_SHAPE one way or the other is worth of what its picture says. */
const stripShare = ( width: number, height: number ) => width / height > STRIP_SHAPE || height / width > STRIP_SHAPE ? 0.85 : 1;

/** The worth of a cell for a picture drawn whole in it, as a tile draws it unless the two are all but one shape. */
function letterboxWorth( width: number, height: number, ratio: number ): number {
    const drawn = Math.min( width, height * ratio );
    return drawn * ( drawn / ratio ) * stripShare( width, height );
}

// Within this share of the best, two arrangements of a computer's grid are as good, and the evener one is taken.
const NEAR_TIE = 0.04;

/** A tile's place in its block, in pixels of the layout. */
type Box = { key: string, x: number, y: number, w: number, h: number };

const boxesOf = ( positions: GroupVideoPositions, width: number, height: number ): Box[] => [ ...positions ].map( ( [ key, at ] ) =>
    ( { key, x: at.x * width / 100, y: at.y * height / 100, w: at.width * width / 100, h: at.height * height / 100 } ) );

// A share in hundredths, to a millionth: a place worked out to 1e-14 is written `1.4e-14%`, which some CSS parsers drop.
const shareOf = ( part: number, whole: number ) => whole > 0 ? Math.round( part / whole * 1e8 ) / 1e6 + 0 : 0;

const placesOf = ( boxes: Box[], width: number, height: number ): GroupVideoPositions => new Map( boxes.map( ( box ) => [ box.key, {
    x: shareOf( box.x, width ), y: shareOf( box.y, height ), width: shareOf( box.w, width ), height: shareOf( box.h, height ),
} ] ) );

const extentOf = ( boxes: Box[] ) => ( {
    w: boxes.length ? Math.max( ...boxes.map( ( box ) => box.x + box.w ) ) : 0,
    h: boxes.length ? Math.max( ...boxes.map( ( box ) => box.y + box.h ) ) : 0,
} );

// A tile's gutter, its padding on both sides (_call-stage.scss, .wplus-group-call-input-video): its picture is drawn
// inside it, so a cell cut to a picture is the picture and the gutter.
const TILE_GUTTER = 8;

/**
 * A block's equal cells cut to their pictures: as wide as the widest of them drawn at the cell's height, and as tall as
 * the tallest drawn at that width, each in the column and row it had, packed from the top start.
 */
function cutToPictures( boxes: Box[], shapeOf: ( key: string ) => number ): Box[] {
    if ( ! boxes.length || ! ( boxes[ 0 ].w > TILE_GUTTER ) || ! ( boxes[ 0 ].h > TILE_GUTTER ) ) return boxes;
    const shapes = boxes.map( ( box ) => shapeOf( box.key ) );
    const cellWidth = boxes[ 0 ].w, cellHeight = boxes[ 0 ].h;
    const width = Math.min( cellWidth, ( cellHeight - TILE_GUTTER ) * Math.max( ...shapes ) + TILE_GUTTER );
    const height = Math.min( cellHeight, ( width - TILE_GUTTER ) / Math.min( ...shapes ) + TILE_GUTTER );
    return boxes.map( ( box ) => ( { key: box.key, x: Math.round( box.x / cellWidth ) * width, y: Math.round( box.y / cellHeight ) * height, w: width, h: height } ) );
}

/** Each row of the boxes in the middle of `width`, a short last row too. */
function centreRows( boxes: Box[], width: number ) {
    const rows = new Map<number, Box[]>();
    boxes.forEach( ( box ) => rows.set( Math.round( box.y ), [ ...( rows.get( Math.round( box.y ) ) ?? [] ), box ] ) );
    rows.forEach( ( row ) => {
        const start = Math.min( ...row.map( ( box ) => box.x ) );
        const shift = ( width - ( Math.max( ...row.map( ( box ) => box.x + box.w ) ) - start ) ) / 2 - start;
        row.forEach( ( box ) => box.x += shift );
    } );
}

/**
 * A call with a main block (the spotlight, Speaker's speaker, the pins), laid out: every tile cut to its picture, each
 * block as small as its tiles, and the two together in the middle of the call, with the room they leave shared on both
 * sides. Beside a tall picture the two stand in the middle of the call's width, each as wide as its tiles, and the
 * tiles of each in the middle of its height while they fit it. One over the other they stand in the middle of its
 * height, each as tall as its tiles, and each row of tiles in the middle of the width. A strip longer than the call
 * scrolls from its start as before, its rows across, a column down. Asked on 2026-11-02, of a phone's upright camera in
 * the spotlight beside a column of two: "if the tiles are layout like that they should be centered at screen at least
 * instead of having empty space at right side". `lead` is the room before the first block: across beside, down over.
 */
function compose( main: { positions: GroupVideoPositions, width: number, height: number }, rest: { positions: GroupVideoPositions, width: number, height: number },
    beside: boolean, stage: { width: number, height: number }, shapeOf: ( key: string ) => number ) {
    const primary = cutToPictures( boxesOf( main.positions, main.width, main.height ), shapeOf );
    const secondary = cutToPictures( boxesOf( rest.positions, rest.width, rest.height ), shapeOf );
    const mainExtent = extentOf( primary ), restExtent = extentOf( secondary );
    let mainWidth = main.width, mainHeight = main.height, restWidth = rest.width, restHeight = rest.height, lead = 0;
    const down = ( boxes: Box[], by: number ) => boxes.forEach( ( box ) => box.y += by );

    if ( beside ) {
        if ( primary.length ) mainWidth = mainExtent.w;
        if ( secondary.length ) restWidth = restExtent.w;
        centreRows( primary, mainWidth );
        centreRows( secondary, restWidth );
        if ( mainExtent.h < mainHeight ) down( primary, ( mainHeight - mainExtent.h ) / 2 );
        if ( restExtent.h < restHeight ) down( secondary, ( restHeight - restExtent.h ) / 2 );
        lead = Math.max( 0, ( stage.width - mainWidth - restWidth ) / 2 );
    } else {
        if ( primary.length ) mainHeight = mainExtent.h;
        if ( secondary.length ) restHeight = restExtent.h;
        centreRows( primary, mainWidth );
        if ( restExtent.w <= restWidth + 0.5 ) centreRows( secondary, restWidth );
        lead = Math.max( 0, ( stage.height - mainHeight - restHeight ) / 2 );
    }

    return {
        primary: placesOf( primary, mainWidth, mainHeight ), secondary: placesOf( secondary, restWidth, restHeight ),
        primaryWidth: mainWidth, primaryHeight: mainHeight, secondaryWidth: restWidth, secondaryHeight: restHeight, lead: Math.round( lead * 1000 ) / 1000,
    };
}

/**
 * A group video call's tiles, fitted to the call's area: the spotlight for everyone, or while nobody is in it what the
 * user's layout makes large (layout-choice.tsx: Auto's pins and a broadcast's speakers, Speaker's one, none in Tiled),
 * in a primary block, everyone else in a secondary one, side by side or stacked as the space allows, each tile at the
 * shape of its picture. With nothing large the secondary block is paged with Previous and Next where it is wider than
 * the call, and beside or under a large tile it is a strip that scrolls. The tiles the user hides are laid out as if
 * not there, their sound still played. `onStage` is told whether everyone in the call is on the stage now, for the call
 * to offer its Participants only where someone isn't.
 */
export default function GroupVideoGrid( { onStage }: { onStage?: ( everyone: boolean ) => void } = {} ) {
    const videoGridEl = useRef<HTMLDivElement>(null);
    const [ videoGridHeight, setVideoGridHeight ] = useState<number | undefined>(undefined);
    const lastHeight = useRef(0)
    const lastWidth  = useRef(0)
    const [primaryVideoPositions, setPrimaryVideoPositions] = useState<GroupVideoPositions>(new Map)
    const [secondaryVideoPositions, setSecondaryVideoPositions] = useState<GroupVideoPositions>(new Map)

    const {
        wrapper,
        participants: rawParticipants,
        callMode,
        thread,
        spotlight,
        showTiles
    } = useContext<CallContextInterface>( CallContext );
    const { pinned } = useContext( PinsContext );
    const { choice } = useContext( LayoutChoiceContext );
    const secondaryEl = useRef<HTMLDivElement>(null);
    // Where the secondary block is scrolled to, in hundredths of its own width and height, which the tiles' places are
    // in too: a page of the grid is 100 across, and a strip scrolls by any amount (PageArrows, a swipe, a wheel). And
    // whether a strip has more before and after what is in view, for its faded edges.
    const [ view, setView ] = useState( { x: 0, y: 0, before: false, after: false } );
    // Which way the secondary block scrolls as a strip, as last laid out (stripAxis).
    const [ scrollAxis, setScrollAxis ] = useState<'x' | 'y' | null>( null );

    // 2.x group-video-chat.tsx passed the rendered participant map through
    // better_messages_group_video_call_items(items, thread) — integrations
    // hide or decorate tiles with it. The host names it: Better Messages adds
    // its prefix, so the same filter as before.
    const participants = applyFilters(
        'group_video_call_items', rawParticipants, thread,
    ) as typeof rawParticipants;

    // The tiles laid out: the ones the filter left, less what the user hides. Measured from here, not from the call's
    // own map, which still holds the tiles the filter took out. Hide People Without Video shows those of them who speak
    // (useVoiced), and `quiet` is what it shows without them: whether anyone is off the stage is read from that, so
    // Participants doesn't come and go as they do.
    const voiced = useVoiced( participants, choice.hideNoVideo );
    const shown = useMemo( () => visibleTiles( participants, choice, spotlight, voiced ), [ participants, choice, spotlight, voiced ] );
    const quiet = useMemo( () => voiced.size ? visibleTiles( participants, choice, spotlight ) : shown, [ participants, choice, spotlight, voiced, shown ] );
    const shownRef = useRef( shown );
    shownRef.current = shown;
    const focus = useSpeakerFocus( shown, choice.mode === 'speaker' );

    const [ primaryRowHeight, setPrimaryRowHeight, primaryRowHeightRef ] = useStateRef<number>(0);
    const [ secondaryRowHeight, setSecondaryRowHeight, secondaryRowHeightRef ] = useStateRef<number>(0);

    // The two blocks are stacked, one over the other, until the primary one
    // is taller than it is wide — see findBestFitPrimaryGrid — and then they
    // stand side by side and each needs a width of its own.
    const [ primaryWidth, setPrimaryWidth ] = useState<number>(0);
    const [ secondaryWidth, setSecondaryWidth, secondaryWidthRef ] = useStateRef<number>(0);
    const [ beside, setBeside ] = useState<boolean>(false);
    // With a main block, the room before the two blocks that puts them in the middle of the call (compose()): across
    // beside, down over, in pixels of the layout, and the layout's width, which widths beside are shares of.
    const [ lead, setLead ] = useState<number>(0);
    const [ stageWidth, setStageWidth ] = useState<number>(0);

    const [ primaryItems, setPrimaryItems, primaryItemsRef ] = useStateRef<Set<string>>(new Set);

    // A phone or a tablet (above): the tiles whose cameras fill their cells.
    const touch = isMobile();
    const [ covered, setCovered ] = useState<Set<string>>( new Set );

    const callModeRef = useRef(callMode);
    useEffect(() => { callModeRef.current = callMode; }, [callMode]);

    const checkSizeChangeInterval = useRef<number | undefined>(undefined);

    useEffect(() => {
        window.addEventListener('resize', updateGrid );
        checkSizeChangeInterval.current = window.setInterval( checkSizeChange, 1000 );

        // The stage slides in from nothing — .wplus-call-surface animates its
        // width — and the first tile is now drawn at the start of that slide
        // rather than after the site has answered `groupCallStart`. Measured
        // once, against a container still 0 wide, updateGrid gives up and
        // every tile is left without a box to be drawn in until the poll
        // below next comes round. The observer follows the slide instead.
        let observer : ResizeObserver | null = null;

        if( typeof ResizeObserver !== 'undefined' && wrapper.current ){
            observer = new ResizeObserver( () => updateGrid() );
            observer.observe( wrapper.current );
        }

        return () => {
            window.removeEventListener('resize', updateGrid );
            window.clearInterval( checkSizeChangeInterval.current );
            observer?.disconnect();
        }
    }, []);

    // Participants standing as a column at the stage's end edge (people-panel.tsx) takes its width from the tiles.
    const peopleColumn = useContext( PeopleColumnContext );
    const columnWidth = () => videoGridEl.current?.parentElement?.querySelector<HTMLElement>('.wplus-call-people[data-mode="column"]')?.getBoundingClientRect().width ?? 0;

    useEffect(() => {
        updateGrid();
    }, [ peopleColumn ]);

    // The stage inside the call's padding: a call filling the window keeps clear of the screen's safe areas (_touch.scss).
    const stageSize = ( wrap: HTMLElement ) => {
        const rect = wrap.getBoundingClientRect();
        const style = window.getComputedStyle( wrap );
        const pad = ( side: string ) => parseFloat( style.getPropertyValue( 'padding-' + side ) ) || 0;
        return { width: rect.width - pad( 'left' ) - pad( 'right' ), height: rect.height - pad( 'top' ) - pad( 'bottom' ) };
    };

    const checkSizeChange = () => {
        if( ! wrapper.current || ! videoGridEl.current?.parentElement ) return;

        const controls = videoGridEl.current.parentElement.querySelector<HTMLElement>('.wplus-group-call-controls-v2');
        if( ! controls ) return;

        const stage = stageSize( wrapper.current );
        const containerWidth = stage.width - columnWidth();
        const containerHeight = stage.height;
        const controlsHeight = controls.getBoundingClientRect().height;

        let resultHeight = containerHeight - controlsHeight;

        if (lastHeight.current !== resultHeight || lastWidth.current !== containerWidth) {
            updateGrid();
        }
    }

    const findBestFitPrimaryGrid = (
        containerWidth: number,
        containerHeight: number
    ) : {
        primaryRowHeight: number;
        secondaryRowHeight: number;
        primaryWidth: number;
        secondaryWidth: number;
        beside: boolean;
        positions: GroupVideoPositions
    } => {
        const minSecondaryHeight = 100;
        const minSecondaryWidth = minSecondaryHeight * DEFAULT_TILE_RATIO;

        let minRatio = DEFAULT_TILE_RATIO;
        let maxRatio = DEFAULT_TILE_RATIO;

        const primaryVideoPositions : GroupVideoPositions = new Map();

        if (containerWidth <= 0 || containerHeight <= 0) {
            return {
                primaryRowHeight: 0,
                secondaryRowHeight: 0,
                primaryWidth: 0,
                secondaryWidth: 0,
                beside: false,
                positions: primaryVideoPositions
            }
        }

        const count = primaryItemsRef.current.size;
        const participantsCount = shownRef.current.size;

        const onlyPrimaryParticipants = count === participantsCount;

        // What the tiles here are shaped like. A shared screen is what its
        // tile draws, so it is the screen that is measured — reading the
        // camera, which is what this did, answered 16:9 for somebody sharing
        // a phone and 16:9 again for somebody sharing with their camera off.
        primaryItemsRef.current.forEach( ( key ) => {
            const ratio = participantRatio( shownRef.current.get( key ) );

            if( ratio === null ) return;

            if( ratio < minRatio ) minRatio = ratio;
            if( ratio > maxRatio ) maxRatio = ratio;
        });

        // The shape of the block before its size, because the size follows
        // from it: four pinned tiles in two columns want a block half as tall
        // as four in one. `containerWidth / minRatio` answered for a single
        // column however many there turned out to be.
        let columns = Math.ceil( Math.sqrt( count ) );
        let rows = Math.ceil( count / columns );

        if( onlyPrimaryParticipants && count === 2 ){
            rows = 2;
            columns = 1;
        } else if ( isMobile() ){
            rows = primaryItemsRef.current.size;
            columns = 1;
        }

        // Tall enough for the tallest picture in it, drawn at the width one
        // column gives it, once per row.
        let primaryRowHeight = ( containerWidth / columns ) / minRatio * rows;
        let secondaryRowHeight = containerHeight - primaryRowHeight;

        let primaryWidth = containerWidth;
        let secondaryWidth = containerWidth;
        let beside = false;

        // On a phone or a tablet the main block is as tall as its pictures, as anywhere: a computer's camera over a phone
        // held upright leaves the rest of the screen to the others' grid, where it was letterboxed in all but a strip.

        if( secondaryRowHeight < minSecondaryHeight ) {
            primaryRowHeight = containerHeight - minSecondaryHeight;
            secondaryRowHeight = minSecondaryHeight;
        }

        // A picture taller than it is wide cannot be handed the container's
        // full width: the tile is then mostly the ground either side of it.
        // Somebody sharing a phone is exactly that — about 9:19.5 — and the
        // stack was the only division this had, so pinning their share drew
        // it as a narrow strip down the middle of a very wide box with the
        // rest of the call squashed into a hundred pixels underneath.
        //
        // A tall block stands beside the others instead. It keeps its own
        // shape, takes only the width that shape needs, and the secondary
        // tiles have the rest as a column — which is a better shape for them
        // than a strip in any case.
        //
        // Only where there is width to divide — wider than it is tall, and
        // wide enough for a tile on each side of the division. A phone holds
        // its container portrait, and there stacking is right for a tall
        // share too.
        //
        // A phone on its side too, whatever the picture: a strip under the main one would leave both a sliver of its
        // height, and beside it the others have a column of the full height.
        const phoneOnItsSide = touch && phoneSized() && containerWidth > containerHeight * 1.5;
        if( ( minRatio < TALL_TILE_RATIO || phoneOnItsSide ) && containerWidth > containerHeight && containerWidth > minSecondaryWidth * 2 ){
            beside = true;

            primaryWidth = Math.min(
                containerWidth - minSecondaryWidth,
                ( containerHeight / rows ) * minRatio * columns
            );

            primaryWidth = Math.max( primaryWidth, minSecondaryWidth );

            secondaryWidth = containerWidth - primaryWidth;
            primaryRowHeight = containerHeight;
            secondaryRowHeight = containerHeight;
        }

        if( onlyPrimaryParticipants ){
            primaryRowHeight = containerHeight;
            secondaryRowHeight = 0;
            primaryWidth = containerWidth;
            secondaryWidth = 0;
            beside = false;
        }

        setPrimaryRowHeight( primaryRowHeight );
        setSecondaryRowHeight( secondaryRowHeight );
        setPrimaryWidth( primaryWidth );
        setSecondaryWidth( secondaryWidth );
        setBeside( beside );

        const itemsPerRow = count / rows;
        let index = 0;
        let row = 0;

        let widthPercent  = 100 / columns; // Width as a percentage
        let heightPercent = 100 / rows; // Height as a percentage

        primaryItemsRef.current.forEach( ( key ) => {
            if( index >= itemsPerRow ) {
                row++;
                index = 0;
            }

            const xPercent = index * widthPercent;
            const yPercent = row * heightPercent;

            primaryVideoPositions.set(key, { x: xPercent, y: yPercent, width: widthPercent, height: heightPercent });

            index++;
        });

        return {
            primaryRowHeight,
            secondaryRowHeight,
            primaryWidth,
            secondaryWidth,
            beside,
            positions: primaryVideoPositions
        }
    };

    const latestSecondaryPositions = useRef<string[]>([]);
    // The grid's order as last laid out, keeping the place of everyone out of it for now (pinned, in the spotlight,
    // hidden by the layout), so they come back to it: a strip while someone is large, or a pin undone, used to put
    // them at the end of their kind. Only leaving the call gives a place up.
    const gridOrder = useRef<string[]>([]);
    const everyoneRef = useRef( participants );
    everyoneRef.current = participants;
    // Which way the secondary block scrolls as a strip, from the last layout: across, down, or not at all (pages).
    const stripAxis = useRef<'x' | 'y' | null>( null );

    const findBestFitSecondaryLayout = (
        containerWidth: number,
        containerHeight: number,
        // The block stands beside the primary one, a column, rather than under it.
        beside = false,
    ): GroupVideoPositions => {
        const secondaryVideoPositions : GroupVideoPositions = new Map();
        stripAxis.current = null;

        if (containerWidth < 0 || containerHeight < 0) {
            return secondaryVideoPositions;
        }

        // Out of the grid: the main block's tiles.
        const apart = ( key: string ) => primaryItemsRef.current.has( key );
        const count = shownRef.current.size - primaryItemsRef.current.size;

        if ( count < 1 || ! Number.isInteger( count ) ) {
            return secondaryVideoPositions;
        }

        // Screen-aware, for the same reason the primary block is: a cell has
        // to hold the picture its tile actually draws.
        let maxRatio = DEFAULT_TILE_RATIO;

        shownRef.current.forEach( ( participant, key ) => {
            if( ! apart( key ) ) {
                const ratio = participantRatio( participant );

                if( ratio !== null && ratio > maxRatio ) maxRatio = ratio;
            }
        });

        const minVideoHeight = 100;
        const minVideoWidth = minVideoHeight * maxRatio;

        // The arrangement that makes the pictures biggest.
        //
        // Every column count is a candidate. Each one implies a number of rows,
        // and so a cell of `containerWidth / columns` by `containerHeight /
        // rows`; a picture of the call's own aspect letterboxed into that cell
        // — which is what a tile draws — has an area. The largest area wins.
        // One loop, no special cases, and it answers for any number of people
        // in any container.
        //
        // It is why two people stack in a tall container and sit side by side
        // in a wide one, without either being written down. What it replaces
        // was `ceil(sqrt(count))` walked down until the tiles cleared a
        // minimum, and then `if (count === 2) one column` on top of that — at
        // every container shape. That last line is why a phone turned on its
        // side showed two very wide letterboxes with a small avatar in each,
        // and the apps, which copy this file, showed the same. They carry the
        // search now and so does this.
        //
        // The minimum stays as a ceiling on how many tiles may share the
        // container rather than as a shape rule; anything past what fits pages
        // as it did before.
        let participants = new Map(shownRef.current);

        let index = 0;

        const videosEnabled = new Set<string>();
        const currentlyTalking = new Set<string>();

        participants.forEach( ( participant, key ) => {
            if ( ! apart(key) ) {
                // a camera moving to another codec keeps its place: it is out of the room for a moment only
                // (videoOptimizing, optimizing.tsx)
                if( hasPicture( participant ) ) {
                    videosEnabled.add(key);
                }

                if( participant.isSpeaking ) {
                    currentlyTalking.add(key);
                }
            }
        });

        // Out of the grid for now: kept their place in its order.
        const away = ( key: string ) => ! shownRef.current.has( key ) || apart( key );
        gridOrder.current = gridOrder.current.filter( ( key ) => everyoneRef.current.has( key ) );
        const placed = new Set( gridOrder.current );

        // Beside or under a large tile, the rest are a strip that scrolls, with no pages: sideways in one row (below),
        // else down, a column beside a tall picture or a phone's grid under the speaker. In the order they joined, so
        // a tile keeps its place in the strip while people talk and turn cameras on and off.
        const strip = primaryItemsRef.current.size > 0;

        // Elsewhere where they were, by kind: a picture, then talking without one, then the rest, and a tile back from
        // the main block or from hiding where it was before. Someone new to the grid takes their place by kind at once,
        // after the others of their kind: put at the end, they moved again on the next layout.
        const order = [ ...gridOrder.current.filter( ( key ) => ! away( key ) ), ...Array.from( participants.keys() ).filter( ( key ) => ! placed.has( key ) && ! apart( key ) ) ];
        const combinedKeys = strip ? Array.from( participants.keys() ).filter( ( key ) => ! apart( key ) ) : [
            ...order.filter( ( key ) => videosEnabled.has( key ) ),
            ...order.filter( ( key ) => currentlyTalking.has( key ) && ! videosEnabled.has( key ) ),
            ...order.filter( ( key ) => ! videosEnabled.has( key ) && ! currentlyTalking.has( key ) ),
        ];

        latestSecondaryPositions.current = combinedKeys;

        const mostColumns = Math.max( 1, Math.min( count, Math.floor( containerWidth / minVideoWidth ) ) );
        const mostRows = Math.max( 1, Math.floor( containerHeight / minVideoHeight ) );

        let columns = 1;
        let rows = count;
        let bestArea = -1;

        if ( touch ) {
            // A phone or a tablet: the pictures of the first page, each at its own shape, whole in its cell (above).
            const pageMost = phoneSized() ? TOUCH_PAGE_MOST.phone : TOUCH_PAGE_MOST.tablet;
            const ratios = combinedKeys.map( ( key ) => participantRatio( participants.get( key ) ) ?? DEFAULT_TILE_RATIO );
            const touchColumns = Math.max( 1, Math.min( count, pageMost, Math.floor( containerWidth / ( minVideoHeight * 1.2 ) ) ) );

            for ( let tryColumns = 1; tryColumns <= touchColumns; tryColumns++ ) {
                const tryRows = Math.max( 1, Math.min( Math.ceil( count / tryColumns ), mostRows, Math.floor( pageMost / tryColumns ) ) );
                const width = containerWidth / tryColumns;
                const height = containerHeight / tryRows;
                let worth = 0;

                for ( let i = 0; i < Math.min( count, tryColumns * tryRows ); i++ ) worth += letterboxWorth( width, height, ratios[ i ] );

                if ( worth > bestArea ) {
                    bestArea = worth;
                    columns = tryColumns;
                    rows = tryRows;
                }
            }
        } else {
            // A computer: the pictures of the first page, each at its own shape (one with no picture at the call's),
            // inside its cell, letterboxed the way the tile letterboxes it, a cell longer than STRIP_SHAPE worth less.
            // The cell's own area would answer a different question, which arrangement leaves the least dead space,
            // and pick tall thin cells for wide pictures. Counted for the widest picture alone, a stage taller than it
            // is wide made four people a column of wide strips, by a few per cent over two by two, an upright camera a
            // sliver in its strip. Within NEAR_TIE of the best, the evenest arrangement is taken.
            const ratios = combinedKeys.map( ( key ) => participantRatio( participants.get( key ) ) ?? DEFAULT_TILE_RATIO );
            const tried: { columns: number, rows: number, worth: number }[] = [];

            for ( let tryColumns = 1; tryColumns <= mostColumns; tryColumns++ ) {
                const tryRows = Math.min( Math.ceil( count / tryColumns ), mostRows );
                const width = containerWidth / tryColumns;
                const height = containerHeight / tryRows;
                let worth = 0;

                for ( let i = 0; i < Math.min( count, tryColumns * tryRows ); i++ ) worth += letterboxWorth( width, height, ratios[ i ] );

                tried.push( { columns: tryColumns, rows: tryRows, worth } );
            }

            const best = Math.max( ...tried.map( ( one ) => one.worth ) );
            const pick = tried.filter( ( one ) => one.worth >= best * ( 1 - NEAR_TIE ) )
                .sort( ( a, b ) => Math.abs( a.columns - a.rows ) - Math.abs( b.columns - b.rows ) || b.worth - a.worth )[ 0 ];
            if ( pick ) {
                columns = pick.columns;
                rows = pick.rows;
            }
        }

        // Still `let`: the branch below, for a strip under a pinned speaker,
        // works the shape out a second way and overwrites them.
        let widthPercent  = 100 / columns; // Width as a percentage
        let heightPercent = 100 / rows; // Height as a percentage

        // A strip rather than a grid.
        //
        // Stacked under a primary block, the rest get `minSecondaryHeight`
        // and no more — one tile tall. The search above, asked which
        // arrangement draws the biggest picture in a box that can hold one
        // row, answers "one column": one tile on show and everyone else paged
        // off the side. So a block that can only hold one row is laid out by
        // how many tiles fit across it instead, and scrolls sideways past that.
        //
        // What decides it is the block's own height. That used to be a
        // comparison against `minRatio * calculatedWidth`, a width times a
        // ratio, which is a width — and one large enough that this branch ran
        // whenever anything was pinned at all. It therefore also ran for the
        // column beside a tall primary, which is not a strip and lost
        // everything past its first tile to `x >= 100%`.
        if( primaryRowHeightRef.current > 0 && containerHeight < minVideoHeight * 2 ){
            const itemWidth = Math.max( 1, containerHeight * maxRatio );
            const possibleColumns = Math.max( 1, Math.ceil( containerWidth / itemWidth ) );

            widthPercent = 100 / possibleColumns;
            heightPercent = 100;

            combinedKeys.forEach((key) => {
                if ( ! primaryItemsRef.current.has(key) ) {
                    secondaryVideoPositions.set(key, { x: index * widthPercent, y: 0, width: widthPercent, height: heightPercent });

                    index++;
                }
            });

            stripAxis.current = 'x';
            return secondaryVideoPositions;
        }

        // A strip of more rows: beside a tall picture a column, its rows past the block's height scrolled down to; under
        // one, a block of rows as tall as the room left, one block's worth after another across, scrolled to freely,
        // as it was before it had pages. Its cells are cut to their pictures and placed in the call by compose().
        if ( strip ) {
            const perBlock = columns * rows;
            combinedKeys.forEach( ( key, at ) => {
                const within = beside ? at : at % perBlock;
                const across = beside ? 0 : Math.floor( at / perBlock ) * 100;
                secondaryVideoPositions.set( key, { x: across + ( within % columns ) * widthPercent, y: Math.floor( within / columns ) * heightPercent, width: widthPercent, height: heightPercent } );
            } );

            stripAxis.current = beside ? 'y' : 'x';
            return secondaryVideoPositions;
        }

        const itemsPerPage = columns * rows;

        if( participants.has('me') && ! apart('me') ) {
            latestSecondaryPositions.current = latestSecondaryPositions.current.filter( ( key ) => key !== 'me' );
            if( count <= itemsPerPage ){
                latestSecondaryPositions.current.push('me');
            } else {
                // More people than a page: the user's own tile is the first page's last, so they always see
                // themselves. It was put there only in place of a tile with no picture and nobody speaking, and left
                // out altogether otherwise, so a big call with cameras on lost the self view.
                const before = latestSecondaryPositions.current.slice(0, itemsPerPage - 1);
                const after = latestSecondaryPositions.current.slice(itemsPerPage - 1);
                latestSecondaryPositions.current = [ ... before, 'me', ... after ];
            }
        }

        // The grid's order, this layout's in the places of those in it, everyone out of it where they were.
        const laid = latestSecondaryPositions.current;
        let next = 0;
        gridOrder.current = [ ...gridOrder.current.map( ( key ) => away( key ) ? key : laid[ next++ ] ), ...laid.slice( next ) ];

        let page = 1;
        let pageRow = 0;

        latestSecondaryPositions.current.map( ( key ) => {
            if( ! primaryItemsRef.current.has( key ) ) {
                let row = Math.floor(index / columns);
                let col = index % columns;

                let xPercent = col * widthPercent;
                let yPercent = row * heightPercent;

                if( page > 1 ){
                    let pageCol = page - 1;
                    xPercent = 100 + ( ( pageCol - 1 ) * widthPercent );
                    pageRow++;
                    yPercent = ( pageRow - 1 ) * heightPercent;

                    if( pageRow >= rows ){
                        pageRow = 0;
                        page++;
                    }
                } else {
                    index++;

                    if( index === itemsPerPage ){
                        page++;
                        index = 0;
                    }
                }

                secondaryVideoPositions.set(key, { x: xPercent, y: yPercent, width: widthPercent, height: heightPercent });
            }
        })

        // On a phone or a tablet a last row short of the others stands in the middle, as the grid's own row would.
        const inLast = count - ( rows - 1 ) * columns;
        if ( touch && count <= columns * rows && inLast > 0 && inLast < columns ) {
            const shift = ( columns - inLast ) * widthPercent / 2;
            secondaryVideoPositions.forEach( ( position ) => {
                if ( position.x < 100 && Math.abs( position.y - ( rows - 1 ) * heightPercent ) < 0.01 ) position.x += shift;
            } );
        }

        return secondaryVideoPositions;
    };

    const updateGrid = () => {
        if( ! wrapper.current || ! videoGridEl.current?.parentElement ) return;

        const controls = videoGridEl.current.parentElement.querySelector<HTMLElement>('.wplus-group-call-controls-v2');
        if( ! controls ) return;

        const stage = stageSize( wrapper.current );
        const containerWidth = stage.width - columnWidth();
        const containerHeight = stage.height;

        const controlsStyle = window.getComputedStyle(controls);
        const controlsHeight = controls.getBoundingClientRect().height;
        const controlsBottom = parseInt(controlsStyle.getPropertyValue('bottom')) || 0;

        // No extra slack under the grid: every tile already carries a 4px
        // gutter of its own, and the controls bar's top padding is the gap.
        let resultHeight = containerHeight - controlsHeight - controlsBottom;
        let resultWidth = containerWidth;

        if( resultHeight <= 0 || resultWidth <= 0 ) return;

        setVideoGridHeight(resultHeight);

        lastHeight.current = resultHeight;
        lastWidth.current = resultWidth;

        const numSquares = shownRef.current.size;

        if (numSquares === 0) return;

        const primaryItemsCount = primaryItemsRef.current.size;
        let besideNow = false;
        let mainNow = { positions: new Map() as GroupVideoPositions, width: 0, height: 0 };

        // With a main block the two are laid out inside the grid's padding, the box they stand in, so the room they
        // leave is the same on both sides: laid out over the padding, they ran past its bottom by its height.
        if( primaryItemsCount > 0 && videoGridEl.current ){
            const gridStyle = window.getComputedStyle( videoGridEl.current );
            const pad = ( side: string ) => parseFloat( gridStyle.getPropertyValue( 'padding-' + side ) ) || 0;
            resultWidth = Math.max( 1, resultWidth - pad( 'left' ) - pad( 'right' ) );
            resultHeight = Math.max( 1, resultHeight - pad( 'top' ) - pad( 'bottom' ) );
        }

        if( primaryItemsCount > 0 ){
            const primaryVideoGrid = findBestFitPrimaryGrid( resultWidth, resultHeight );
            besideNow = primaryVideoGrid.beside;
            mainNow = { positions: primaryVideoGrid.positions, width: primaryVideoGrid.primaryWidth, height: primaryVideoGrid.primaryRowHeight };

            setPrimaryRowHeight(primaryVideoGrid.primaryRowHeight);
            setSecondaryRowHeight(primaryVideoGrid.secondaryRowHeight);
            setPrimaryWidth(primaryVideoGrid.primaryWidth);
            setSecondaryWidth(primaryVideoGrid.secondaryWidth);
            setBeside(primaryVideoGrid.beside);
            setPrimaryVideoPositions(primaryVideoGrid.positions);
        } else {
            setPrimaryRowHeight(0);
            setSecondaryRowHeight(resultHeight);
            setPrimaryWidth(0);
            setSecondaryWidth(resultWidth);
            setBeside(false);
        }

        // The block's own width, which is the whole container until a tall
        // primary takes a share of it.
        let secondaryVideoPositions = findBestFitSecondaryLayout( secondaryWidthRef.current, secondaryRowHeightRef.current, besideNow );

        // With a main block, every tile at its picture's shape and the two blocks together in the middle of the call.
        let leadNow = 0;
        if( primaryItemsCount > 0 ){
            const shapeOf = ( key: string ) => participantRatio( shownRef.current.get( key ) ) ?? DEFAULT_TILE_RATIO;
            const fit = compose( mainNow, { positions: secondaryVideoPositions, width: secondaryWidthRef.current, height: secondaryRowHeightRef.current },
                besideNow, { width: resultWidth, height: resultHeight }, shapeOf );

            setPrimaryVideoPositions( fit.primary );
            setPrimaryRowHeight( fit.primaryHeight );
            setPrimaryWidth( fit.primaryWidth );
            setSecondaryRowHeight( fit.secondaryHeight );
            setSecondaryWidth( fit.secondaryWidth );
            secondaryVideoPositions = fit.secondary;
            leadNow = fit.lead;
        }
        setLead( leadNow );
        setStageWidth( resultWidth );

        setSecondaryVideoPositions(secondaryVideoPositions)
        setScrollAxis( stripAxis.current );

        if ( ! touch ) return;

        // The cameras that fill their cells, the two all but one shape (fillsBox), a shared screen never, nor a camera
        // whose shape is not known yet.
        const cover = new Set<string>();
        secondaryVideoPositions.forEach( ( position, key ) => {
            const participant = shownRef.current.get( key );
            if ( ! participant || participant.screen ) return;
            const width = secondaryWidthRef.current * position.width / 100;
            const height = secondaryRowHeightRef.current * position.height / 100;
            if ( fillsBox( width, height, participantRatio( participant ) ) ) cover.add( key );
        } );
        setCovered( ( was ) => was.size === cover.size && [ ...cover ].every( ( key ) => was.has( key ) ) ? was : cover );
    }

    // What Speaker changes by itself is a cut: every tile takes its new place at once (useGridMoves' `still`), a tile
    // half grown and blurred on its way being worse than none. That is the large tile handed to someone else, a new
    // speaker after SPEAKER_HOLD_MS or a shared screen, and the strip reordered as people start and stop talking (those
    // without a picture who talk come first). Speaker before and after, the same tiles and the same spotlight. A change
    // the person watching makes, the layout, the spotlight, a pin, Participants beside the call, or anyone joining or
    // leaving, still moves them. In every layout, someone Hide People Without Video shows for speaking comes and goes as
    // a cut too, the others taking their places at once.
    const laidOut = useRef<{ mode: string, keys: string, spotlit: string, main: string, talking: string, voiced: string } | null>( null );
    const speakerCut = useRef( false );

    // The main block: the spotlight for everyone while anyone is in it, else what the user's layout makes large
    // (layout-choice.tsx).
    useEffect( () => {
        const main = layoutMainKeys( shown, spotlight, pinned, callModeRef.current === 'broadcast', choice.mode, focus );
        const now = {
            mode: choice.mode,
            keys: [ ...shown.keys() ].join( '|' ),
            spotlit: spotlitKeys( shown, spotlight ).join( '|' ),
            main: main.join( '|' ),
            talking: [ ...shown ].filter( ( [ , p ] ) => p.isSpeaking ).map( ( [ key ] ) => key ).join( '|' ),
            voiced: [ ...voiced ].join( '|' ),
        };
        const was = laidOut.current;
        laidOut.current = now;
        speakerCut.current = !! was && was.mode === 'speaker' && now.mode === 'speaker' && was.keys === now.keys && was.spotlit === now.spotlit
            && was.main !== '' && now.main !== '' && ( was.main !== now.main || was.talking !== now.talking );
        if ( was && ! speakerCut.current && was.mode === now.mode && was.spotlit === now.spotlit && was.keys !== now.keys ) {
            const before = new Set( was.keys.split( '|' ) ), after = new Set( now.keys.split( '|' ) );
            const came = [ ...after ].filter( ( key ) => ! before.has( key ) ), went = [ ...before ].filter( ( key ) => ! after.has( key ) );
            const speaking = new Set( [ ...was.voiced.split( '|' ), ...now.voiced.split( '|' ) ].filter( Boolean ) );
            speakerCut.current = [ ...came, ...went ].every( ( key ) => speaking.has( key ) );
        }
        setPrimaryItems( new Set( main ) );

        updateGrid();
    }, [ shown, spotlight, pinned, choice.mode, focus ] );

    // Where the secondary block is scrolled to, read a frame after it scrolls, and again as its tiles are laid out anew.
    const readView = useRef( () => {} );
    readView.current = () => {
        const el = secondaryEl.current;
        if ( ! el ) return;
        const down = scrollAxis === 'y';
        const at = down ? el.scrollTop : Math.abs( el.scrollLeft );
        const room = down ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
        const next = {
            x: el.clientWidth > 0 ? Math.round( Math.abs( el.scrollLeft ) / el.clientWidth * 100 ) : 0,
            y: el.clientHeight > 0 ? Math.round( el.scrollTop / el.clientHeight * 100 ) : 0,
            before: scrollAxis !== null && at > 1,
            after: scrollAxis !== null && at < room - 1,
        };
        setView( ( was ) => was.x === next.x && was.y === next.y && was.before === next.before && was.after === next.after ? was : next );
    };
    useEffect( () => {
        const el = secondaryEl.current;
        if ( ! el ) return;
        let frame = 0;
        const read = () => {
            frame = 0;
            readView.current();
        };
        const onScroll = () => {
            if ( ! frame ) frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame( read ) : 0;
            if ( ! frame ) read();
        };
        el.addEventListener( 'scroll', onScroll, { passive: true } );
        return () => {
            el.removeEventListener( 'scroll', onScroll );
            if ( frame ) cancelAnimationFrame( frame );
        };
    }, [] );
    useLayoutEffect( () => readView.current(), [ secondaryVideoPositions, secondaryWidth, secondaryRowHeight, scrollAxis ] );

    // A strip across takes an ordinary mouse wheel, which turns down and up, as across: most mice turn no other way. A
    // trackpad's or a tilting wheel's sideways turn, and a pinch, are the browser's, and at either end of the strip the
    // wheel scrolls the page on.
    useEffect( () => {
        const el = secondaryEl.current;
        if ( ! el || scrollAxis !== 'x' ) return;
        const onWheel = ( event: WheelEvent ) => {
            if ( event.ctrlKey || Math.abs( event.deltaX ) >= Math.abs( event.deltaY ) ) return;
            const room = el.scrollWidth - el.clientWidth;
            const step = event.deltaY * ( event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1 );
            const at = Math.abs( el.scrollLeft );
            if ( room <= 0 || ( step < 0 && at <= 0 ) || ( step > 0 && at >= room - 1 ) ) return;
            event.preventDefault();
            el.scrollLeft += getComputedStyle( el ).direction === 'rtl' ? -step : step;
        };
        el.addEventListener( 'wheel', onWheel, { passive: false } );
        return () => el.removeEventListener( 'wheel', onWheel );
    }, [ scrollAxis ] );

    // Whether a tile's place, in the block's hundredths, is in the part of the block in view, or within `margin` of it.
    const inView = ( position: GroupVideoPositionItem, margin = 0 ) =>
        position.x < view.x + 100 + margin - 0.01 && position.x + position.width > view.x - margin + 0.01
        && position.y < view.y + 100 + margin - 0.01 && position.y + position.height > view.y - margin + 0.01;

    // The tiles drawn, for whoever runs the call to receive only their cameras and screens (the context's showTiles):
    // the main block and the part of the secondary one in view, the page of a grid or as much of a strip as shows.
    // Told only when it changes, and that none are drawn as the grid goes.
    const drawnTold = useRef( '' );
    useEffect( () => {
        if ( ! showTiles ) return;
        const keys = [ ...primaryItems ].filter( ( key ) => primaryVideoPositions.has( key ) );
        secondaryVideoPositions.forEach( ( position, key ) => {
            if ( ! primaryItems.has( key ) && inView( position ) ) keys.push( key );
        } );
        const told = keys.slice().sort().join( '|' );
        if ( told === drawnTold.current ) return;
        drawnTold.current = told;
        showTiles( 'grid', keys );
    }, [ primaryItems, primaryVideoPositions, secondaryVideoPositions, view, showTiles ] );
    useEffect( () => () => {
        showTiles?.( 'grid', [] );
    }, [] );

    // Labeled Spotlight, for everyone.
    const spotlit = new Set( spotlitKeys( participants, spotlight ) );

    const itemsPrimary = [ ... primaryItems ].map( (item) => {
        const participant = participants.get(item);

        if( ! participant ){
            return null;
        }

        const position = primaryVideoPositions.get(item);
        if( ! position ) return null;

        const width  = position.width;
        const height = position.height;
        const x      = position.x;
        const y      = position.y;

        return (<GroupVideoGridItem key={item} unique_key={item} participant={participant} width={width} height={height} x={x} y={y} spotlit={ spotlit.has( item ) } />)
    });

    // Only what is in view and a block's size either side of it are drawn, a page of the grid or a strip's length: a
    // call of hundreds drew every tile on every change of anyone's. A tile further off plays its sound alone
    // (HiddenSound), and the block keeps its length (the pages' stops, the strip's end).
    const pageOf = ( position: GroupVideoPositionItem ) => Math.floor( position.x / 100 + 0.001 );
    const far: React.ReactNode[] = [];

    const items = [ ... shown ].map( (item) => {
        const unique_key = item[0];
        const position = secondaryVideoPositions.get(unique_key);
        if( ! position ) return null;
        if( ! inView( position, 100 ) ){
            if( unique_key !== 'me' ) far.push( <HiddenSound key={ 'far-' + unique_key } participant={ item[1] } id={ unique_key + ':audio' } /> );
            return null;
        }

        const width  = position.width;
        const height = position.height;
        const x      = position.x;
        const y      = position.y;

        return (<GroupVideoGridItem key={unique_key} unique_key={unique_key} participant={item[1]} width={width} height={height} x={x} y={y} spotlit={ spotlit.has( unique_key ) } cover={ covered.has( unique_key ) } />)
    });

    // A stop for each page: the width of the pages whose tiles aren't drawn, and on a phone or a tablet, where the
    // pages swipe, where the scroll snaps to. A strip has no pages: its end holds its length instead.
    let pages = 0;
    let end = { x: 0, y: 0 };
    secondaryVideoPositions.forEach( ( position ) => {
        pages = Math.max( pages, pageOf( position ) + 1 );
        end = { x: Math.max( end.x, position.x + position.width ), y: Math.max( end.y, position.y + position.height ) };
    } );
    const stops = scrollAxis
        ? <span className="wplus-call-strip-end" aria-hidden="true" style={ scrollAxis === 'x' ? { left: end.x + '%' } : { top: end.y + '%' } } />
        : pages > 1 ? Array.from( { length: pages }, ( _, at ) => <span key={ 'page-' + at } className="wplus-call-page-stop" aria-hidden="true" style={ { left: at * 100 + '%' } } /> ) : null;

    // Everyone on the stage: nobody the layout hides (Hide People Without Video, Hide Self View), counting those it shows
    // only while they speak, one page, and a strip with nobody scrolled off either end.
    const offStage = [ ...participants.keys() ].some( ( key ) => ! quiet.has( key ) ) || pages > 1 || view.before || view.after;
    useEffect( () => {
        onStage?.( ! offStage );
    }, [ offStage ] );

    // A new layout: each tile moves to its new place from where it was (grid-moves.ts), unless Speaker cut to a new
    // speaker.
    useGridMoves( videoGridEl, [ primaryVideoPositions, secondaryVideoPositions, primaryRowHeight, secondaryRowHeight, primaryWidth, secondaryWidth, beside, lead ], speakerCut );

    // `beside` turns the two blocks from one over the other into one next to
    // the other; the widths are only meaningful then, so they are left off
    // otherwise and each block spans the grid as it always has.
    //
    // As a share of the container rather than the pixels it was worked out
    // in: the grid is padded, so its content box is a few pixels narrower
    // than what the two were measured against, and two exact widths would
    // come to more than there is room for. Each block is as wide as its tiles
    // (compose()), the two at most the container's width, which is the figure
    // to divide by, and the room they leave is shared before and after them.
    const shareOfWidth = ( width: number ) => ( beside && stageWidth > 0 )
        ? ( width / stageWidth * 100 ) + '%'
        : undefined;
    const leadStyle: React.CSSProperties = ! lead ? {} : beside && stageWidth > 0
        ? { marginInlineStart: ( lead / stageWidth * 100 ) + '%' }
        : { marginTop: lead };

    // The people the user hid: no tile, their sound all the same, in the element their tile takes as it shows. And a
    // stage the switches left empty, saying so.
    const hidden = [ ... participants ].filter( ( [ key ] ) => key !== 'me' && ! shown.has( key ) )
        .map( ( [ key, participant ] ) => <HiddenSound key={ key } participant={ participant } id={ key + ':audio' } /> );
    const why = emptyStage( participants, shown, choice );

    return <div ref={videoGridEl} className="wplus-group-call-videos-grid" data-split={ beside ? 'beside' : 'stacked' } data-layout={ choice.mode } data-touch={ touch ? 1 : undefined } style={{ height: videoGridHeight }}>
        <div className="wplus-group-call-videos-grid-primary" style={{ height: primaryRowHeight, width: shareOfWidth( primaryWidth ), ...leadStyle }}>
            { itemsPrimary }
        </div>

        <div ref={ secondaryEl } className="wplus-group-call-videos-grid-secondary" data-swipe={ touch && ! scrollAxis && stops ? 1 : undefined }
            data-scroll={ scrollAxis ?? undefined } data-more-before={ view.before ? 1 : undefined } data-more-after={ view.after ? 1 : undefined }
            style={{ height: secondaryRowHeight, width: shareOfWidth( secondaryWidth ) }}>
            { items }
            { stops }
        </div>

        { ! scrollAxis && <PageArrows block={ secondaryEl } /> }
        { why && <StageNote why={ why } /> }
        { hidden }
        { far }
    </div>
}
