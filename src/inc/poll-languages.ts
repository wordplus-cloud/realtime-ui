import de from "../languages/polls/de.json";
import es from "../languages/polls/es.json";
import fr from "../languages/polls/fr.json";
import it from "../languages/polls/it.json";
import nl from "../languages/polls/nl.json";
import pl from "../languages/polls/pl.json";
import hr from "../languages/polls/hr.json";
import he from "../languages/polls/he.json";
import { addLanguages } from "./translations.ts";

/**
 * Gives the package's translator the polls' words in the WordPlus languages, in their text domain, `wordplus-polls`.
 * They are kept apart from the shared ones as the live streams' are (scripts/languages.mjs keeps all three), so only a
 * script that draws polls carries them. The polls' i18n.ts calls it.
 */
export function addPollLanguages(): void {
    addLanguages( "wordplus-polls", { de, es, fr, it, nl, pl, hr, he } );
}
