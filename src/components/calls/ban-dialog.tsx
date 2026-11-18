import React, { useContext, useId, useState } from "react";
import { __, _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface } from "./context.ts";
import { CallDialog } from "./recording.tsx";

/**
 * Remove and Ban from Calls, as Better Messages' dialog asks it (its modals/call-ban-user.tsx): for how long, a number
 * and Minutes, Hours or Days, an hour by default, and Ban. Drawn over the call where whoever runs it asks here
 * (the context's `banning`, an app's call: use-group-call.ts); Better Messages asks in its own dialog and sets none. A
 * ban is never longer than `most` minutes, the realtime server's longest. The person leaves the call at once, and a
 * join is refused until the ban ends.
 */
export function BanDialog() {
    const { banning } = useContext<CallContextInterface>( CallContext );
    if ( ! banning ) return null;
    return <BanForm key={ banning.participant.identity } banning={ banning } />;
}

function BanForm( { banning }: { banning: NonNullable<CallContextInterface['banning']> } ) {
    const [ amount, setAmount ] = useState<number | ''>( 1 );
    const [ unit, setUnit ] = useState( 60 );
    const named = useId();
    const minutes = amount === '' ? 0 : Math.min( amount * unit, banning.most );

    const ban = () => {
        if ( ! minutes ) return;
        void banning.ban( minutes );
    };

    return <CallDialog
        icon="ban"
        title={ _x( 'Remove and Ban from Calls', 'Moderation actions', 'bp-better-messages' ) }
        no={ _x( 'Cancel', 'Call recording', 'bp-better-messages' ) }
        yes={ _x( 'Ban', 'Moderation actions', 'bp-better-messages' ) }
        danger
        disabled={ ! minutes }
        onNo={ banning.cancel }
        onYes={ ban }
        escape
    >
        <p className="wplus-call-dialog-lead">{ banning.participant.name }</p>
        <p className="wplus-call-dialog-note">{ _x( 'They leave the call now and cannot join it again until the ban ends.', 'Call Moderation', 'bp-better-messages' ) }</p>
        <label className="wplus-call-ban-label" id={ named }>{ _x( 'Ban from calls for', 'Moderation actions', 'bp-better-messages' ) }</label>
        <span className="wplus-call-ban-row">
            <input className="wplus-call-ban-amount" type="number" min={ 1 } max={ 9999 } value={ amount } aria-labelledby={ named }
                onChange={ ( event ) => {
                    const value = event.target.value.trim();
                    setAmount( value === '' ? '' : Math.max( 1, Math.min( 9999, Math.floor( Number( value ) ) || 1 ) ) );
                } }
                onKeyDown={ ( event ) => { if ( event.key === 'Enter' ) ban(); } } />
            <select className="wplus-call-ban-unit" value={ unit } aria-labelledby={ named } onChange={ ( event ) => setUnit( Number( event.target.value ) ) }>
                <option value={ 1 }>{ __( 'Minutes', 'bp-better-messages' ) }</option>
                <option value={ 60 }>{ __( 'Hours', 'bp-better-messages' ) }</option>
                <option value={ 60 * 24 }>{ __( 'Days', 'bp-better-messages' ) }</option>
            </select>
        </span>
    </CallDialog>;
}
