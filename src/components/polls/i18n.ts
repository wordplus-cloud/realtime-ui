// The polls' words, written with their text domain, `wordplus-polls`, in each call, as the live streams write theirs:
// a WordPress build that puts wp.i18n in this module's place finds every string with its domain, and Better Messages
// finds them in this source as it finds the others. In an app the host translates them, from the package's
// languages/polls/ by default, which addPollLanguages() gives the package's translator.
import { addPollLanguages } from "../../inc/poll-languages.ts";

addPollLanguages();

export { _x, _n, sprintf } from "../../inc/globals.ts";
