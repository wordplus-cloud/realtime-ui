import React, { useContext, useEffect, useState } from "react";
import { CallContext, type CallContextInterface, type CallPerson } from "./context.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon from "../../primitives/icon.tsx";
import { _x } from "../../inc/globals.ts";
import { host } from "../../host.ts";

/**
 * Add Person: the dock's button and the list it opens, of whom the user may bring in, in the call settings' panel.
 * Drawn only when the call's context can add people (`people`, `addPerson`); a call that can't draws nothing.
 */
export function AddPersonButton( { open, setOpen }: { open: boolean, setOpen: ( open: boolean ) => void } ) {
    const { people } = useContext<CallContextInterface>( CallContext );

    if ( ! people ) return null;

    return <Tooltip content={_x('Add Person', 'Call Screen', 'bp-better-messages')}>
        <span onClick={ () => setOpen( ! open ) } className="wplus-add-person" data-active={ open ? 1 : undefined }>
            <Icon name="userPlus" size={ 20 } />
        </span>
    </Tooltip>;
}

export function AddPersonPanel( { close }: { close: () => void } ) {
    const { people, addPerson } = useContext<CallContextInterface>( CallContext );
    const [ list, setList ] = useState<CallPerson[] | null>( null );
    const [ adding, setAdding ] = useState<number | string | null>( null );

    useEffect( () => {
        if ( ! people ) return;
        let live = true;
        people().then( ( found ) => live && setList( found ), ( error ) => {
            if ( ! live ) return;
            setList( [] );
            host().showError( error );
        } );
        return () => {
            live = false;
        };
    }, [ people ] );

    if ( ! people || ! addPerson ) return null;

    const add = async ( person: CallPerson ) => {
        setAdding( person.id );
        try {
            await addPerson( person );
            close();
        } catch ( error ) {
            host().showError( error );
        } finally {
            setAdding( null );
        }
    };

    return <div className="wplus-call-settings wplus-call-add-person">
        <div className="wplus-call-setting">
            <label>{_x('Add Person', 'Call Screen', 'bp-better-messages')}</label>
            { list === null && <div className="wplus-call-add-person-empty">{_x('Loading...', 'Call Screen', 'bp-better-messages')}</div> }
            { list !== null && list.length === 0 && <div className="wplus-call-add-person-empty">{_x('There is no one else to add', 'Call Screen', 'bp-better-messages')}</div> }
            { list !== null && list.length > 0 && <ul className="wplus-call-add-person-list">
                { list.map( ( person ) => <li key={ person.id }>
                    <button type="button" onClick={ () => void add( person ) } disabled={ adding !== null } data-user={ person.id }>
                        { person.avatar ? <img className="avatar" src={ person.avatar } alt="" width={ 28 } height={ 28 } /> : <span className="wplus-call-add-person-blank" /> }
                        <span className="wplus-call-add-person-name">{ person.name }</span>
                        { adding === person.id && <Icon name="spinner" size={ 14 } className="wplus-call-add-person-spinner" /> }
                    </button>
                </li> ) }
            </ul> }
        </div>
    </div>;
}
