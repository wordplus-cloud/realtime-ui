import React, {
    Fragment,
    ReactElement,
    ReactNode,
    cloneElement,
    isValidElement,
    useContext,
    useRef,
} from "react";
import { createPortal } from "react-dom";
import { _x } from "../../inc/globals.ts";
import Icon from "../../primitives/icons.tsx";
import Tooltip from "../helpers/tooltip.tsx";
import CallControl, { type CallControlProps } from "./call-control.tsx";
import { CallContext } from "./context.ts";
import { usePieces } from "../../pieces.tsx";
import FoldingDock from "./folding-dock.tsx";
import { useDockKeys, useKeyAction } from "./call-keys.tsx";
import { CallPopover } from "./moderation-panels.tsx";

// The control dock, kept to ONE row: its tail folds into More (folding-dock.tsx,
// which measures the row), whose button wears the call's tooltip and icon here.
// Before the dock folds, the app's `controls` piece arranges the call's
// controls (pieces.tsx).
//
// A control written inside <DockMore> is in More whatever the room
// (asked on 2026-10-30: "lean dock, keep full screen control, host controls
// (only shown to moderator), settings"): what a call is set up with once,
// such as picture in picture or adding someone, stays out of the row, which
// keeps what is pressed during a call. Where More would hold that one control
// and nothing else, it is that control's own button in More's place instead
// (folding-dock.tsx), and there is no More where it would hold nothing.
//
// More opens one menu, placed and drawn as Host Controls and the device
// settings are (CallPopover), where everything in it is at hand: the controls
// the row folded, as rows at its top, then what the call gives it (`menu`, a
// group video call's layout), then the controls in it whatever the room. It
// opens nothing else to choose from. A row acts and puts the menu away, as the
// sheet before it did. What `menu` holds keeps it open, so a layout and the
// tiles to hide are set in one go.

interface Props {
    // The dock's own class — .wplus-call-buttons (1:1) or
    // .wplus-group-call-controls-buttons (rooms). Both carry the same dock
    // styling; the class stays with the call site so the stylesheet and the
    // specs keep reading the markup 2.0 emitted.
    className : string;
    // Trailing children that never fold into the sheet. Hang up is the one
    // control that has to stay under the thumb at every width.
    pinned?   : number;
    // The call's own part of More, between the folded controls and the rest.
    menu?     : ReactNode;
    children  : ReactNode;
}

// The call's stage, which the menu is placed in as the call's other menus are.
const STAGE = '.wplus-call-container';

// The call sites group their conditionals in fragments — `{ adminMode && <>
// …four buttons… </> }` — and React.Children does not look inside a fragment,
// so a dock that counted its children would see one item where there are
// four. Walk through them.
function flattenItems( nodes: ReactNode ): ReactElement[] {
    const out: ReactElement[] = [];

    React.Children.toArray( nodes ).forEach( ( child ) => {
        if ( ! isValidElement( child ) ) return;

        if ( child.type === Fragment ) {
            out.push( ...flattenItems( ( child.props as { children?: ReactNode } ).children ) );
            return;
        }

        // An app's own button (the `controls` piece): drawn here, as ours are written, so it folds as they do.
        if ( child.type === CallControl ) {
            out.push( cloneElement( CallControl( child.props as CallControlProps ), { key: child.key ?? undefined } ) );
            return;
        }

        out.push( child );
    } );

    return out;
}

/** Controls that are in the dock's More sheet whatever the room, wherever they are written among the dock's children. */
export function DockMore( { children }: { children?: ReactNode } ) {
    return <>{ children }</>;
}

// The row's controls and the sheet's, a DockMore's taken out of the row.
function splitMore( items: ReactElement[] ): { row: ReactElement[], more: ReactElement[] } {
    const row: ReactElement[] = [];
    const more: ReactElement[] = [];
    items.forEach( ( el ) => {
        if ( el.type === DockMore ) more.push( ...flattenItems( ( el.props as { children?: ReactNode } ).children ) );
        else row.push( el );
    } );
    return { row, more };
}

export default function CallDock( { className, pinned = 0, menu, children }: Props ) {
    // The app's `controls` piece arranges ours (pieces.tsx): it may add, drop or reorder them, the sheet's too. Ours
    // pinned at the end (hang up) stay there wherever it puts them, and ours in the sheet stay in it.
    const { controls } = usePieces();
    const call = useContext( CallContext );
    // The call's keys (call-keys.tsx): the row and the sheet as drawn name each key.
    const keys = useDockKeys();
    // The sheet's taken out first, so a DockMore written anywhere, after hang up too, is never counted as pinned.
    const written = splitMore( flattenItems( children ) );
    const ours = written.row;
    const ourMore = written.more;
    // Known by their props, which React.Children keeps when it keys an element anew.
    const ourPinned = new Set<unknown>( ( pinned > 0 ? ours.slice( Math.max( 0, ours.length - pinned ) ) : [] ).map( ( el ) => el.props ) );
    const inMore = new Set<unknown>( ourMore.map( ( el ) => el.props ) );
    const arranged = controls ? splitMore( flattenItems( controls( [ ...ours, ...ourMore ], call ) ) ) : null;
    const isPinned = ( el: ReactElement ) => ourPinned.has( el.props );
    const isMore = ( el: ReactElement ) => inMore.has( el.props );
    const row = arranged ? arranged.row.filter( ( el ) => ! isMore( el ) ) : ours;
    const sheet = arranged ? [ ...arranged.row.filter( isMore ), ...arranged.more ] : ourMore;
    const ordered = arranged ? [ ...row.filter( ( el ) => ! isPinned( el ) ), ...row.filter( isPinned ) ] : ours;
    // Marked in one pass, the row's and the sheet's, so a key finds its control wherever it is.
    const marked = keys.mark( [ ...ordered, ...sheet ] );
    const items = marked.slice( 0, ordered.length );
    const always = marked.slice( ordered.length );
    const pins = arranged ? row.filter( isPinned ).length : pinned;
    // The stage the More button stands in, found from the button, and the dock the menu stands over.
    const stage = useRef<HTMLElement | null>( null );
    const dock = '.' + className.split( /\s+/ )[ 0 ];
    const title = _x( 'More', 'Call Controls', 'bp-better-messages' );
    // More's key presses the button while there is one: none where the dock has no More, or its one control in its place.
    const moreButton = useRef<HTMLSpanElement | null>( null );
    const moreKey = useKeyAction( 'more', () => moreButton.current ? { run: () => moreButton.current?.click(), label: title } : undefined );

    return (
        <FoldingDock
            className={ className }
            pinned={ pins }
            always={ always }
            keep={ !! menu }
            more={ ( { open, toggle, close, rows, folded } ) => <>
                <Tooltip content={ moreKey ? title + ' (' + moreKey.name + ')' : title }>
                    <span
                        ref={ ( el: HTMLSpanElement | null ) => {
                            moreButton.current = el;
                            if ( el ) stage.current = el.closest<HTMLElement>( STAGE );
                        } }
                        onClick={ toggle }
                        className="wplus-call-more"
                        data-active={ open ? 1 : undefined }
                        aria-haspopup="menu"
                        aria-expanded={ open }
                        aria-label={ moreKey ? title : undefined }
                        aria-keyshortcuts={ moreKey?.aria }
                    >
                        <Icon name="more" size={ 20 } />
                    </span>
                </Tooltip>
                { open && stage.current && createPortal(
                    <CallPopover stage={ stage } anchor={ [ dock, '.wplus-call-more' ] } side="above" align="stage-end" label={ title }
                        className="wplus-call-moderation wplus-call-more-menu" close={ close } keep=".wplus-call-more">
                        { folded > 0 && <div className="wplus-call-dock-sheet wplus-call-more-folded" onClick={ close }>{ rows.slice( 0, folded ) }</div> }
                        { menu }
                        { rows.length > folded && <div className="wplus-call-dock-sheet wplus-call-more-rows" onClick={ close }>{ rows.slice( folded ) }</div> }
                    </CallPopover>,
                    stage.current,
                ) }
            </> }
        >
            { items }
        </FoldingDock>
    );
}
