import type { KeyboardEvent } from "react";

/** A span that works as a button from the keyboard too: Better Messages' pages restyle every real button. */
export default function pressable( press: () => void ) {
    return {
        role: 'button',
        tabIndex: 0,
        onClick: press,
        onKeyDown: ( event: KeyboardEvent ) => {
            if ( event.key === 'Enter' || event.key === ' ' ) {
                event.preventDefault();
                press();
            }
        },
    };
}
