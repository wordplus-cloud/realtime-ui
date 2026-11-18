import de from "../languages/recording/de.json";
import es from "../languages/recording/es.json";
import fr from "../languages/recording/fr.json";
import it from "../languages/recording/it.json";
import nl from "../languages/recording/nl.json";
import pl from "../languages/recording/pl.json";
import hr from "../languages/recording/hr.json";
import he from "../languages/recording/he.json";
import { addLanguages } from "./translations.ts";

/** The recording player's text domain, its words kept apart so only a script with the player carries them. */
export const RECORDING_DOMAIN = "wordplus-recording";

let added = false;

/**
 * Gives the package's translator the player's words in the WordPlus languages (scripts/languages.mjs keeps them in
 * src/languages/recording/). A host that translates them itself (Better Messages, through WordPress) ignores the
 * domain and finds them in its own. Here beside the streams' (stream-languages.ts), not among the views: a view an app
 * copies takes it from the recording entry.
 */
export function addRecordingLanguages(): void {
    if ( added ) return;
    added = true;
    addLanguages( RECORDING_DOMAIN, { de, es, fr, it, nl, pl, hr, he } );
}
