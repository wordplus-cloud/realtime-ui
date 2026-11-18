// @wordplus/realtime-ui/polls: polls in a chat. The rules every side of a poll shares (core.ts, with the cases every
// implementation passes in vectors.json), the poll in a message, the form that makes one, and who voted. A script of
// its own, so the main one carries none of it: a host loads it where a poll is drawn or made. Its stylesheet is
// dist/polls.css, or styles/polls/_polls.scss for a host that builds its own.

export * from "./components/polls/core.ts";
export { PollCard, PollEndedCard, PollIcon, pollDeadline, pollKind, type PollCardProps, type PollEndedCardProps } from "./components/polls/card.tsx";
export { PollForm, pollErrorText, type PollFormFeatures, type PollFormProps } from "./components/polls/form.tsx";
export { PollVoters, type PollVotersPage, type PollVotersProps } from "./components/polls/voters.tsx";
export { addPollLanguages } from "./inc/poll-languages.ts";
