// The words the Tooltip helper is given, for the accessible name it stamps on its control: the kit's own plainLabel()
// (src/inc/names.ts) against string-strip-html, which stripped them until 2026-10-31 and stays a dev dependency for
// this alone (test/label-corpus.test.ts without a document, gallery/label.spec.ts in Chromium).
import { stripHtml } from 'string-strip-html';

export const labelBefore = ( content: string ): string => stripHtml( content ).result;

/** Better Messages' own tooltips on the helper (its 3.1 development's content props), as written. */
export const BETTER_MESSAGES: string[] = [
    'Verified', 'Pinned conversation', 'Notifications disabled', 'More', 'Moderator', 'Minimize', 'Maximize', 'End-to-end encrypted',
    'Close', 'Balance', 'Back', 'Pause', 'Play', 'Toggle Chat Screen', 'Transcription', 'Send', 'Resume Recording', 'Re-record',
    'Pause Recording', 'Microphone', 'Finish Recording', 'Cancel', 'Cancel Recording', '',
];

/** What the kit adds to its words: a control's key, as its tooltip names it. */
export const withKeys = ( words: string[] ): string[] => words.flatMap( ( word ) => [ word + ' (Alt+H)', word + ' (\u2325H)', word + ' (Option+Shift+M)' ] );

/** Markup a tooltip could hold, and the white space around it, as string-strip-html read each. */
export const EDGES: string[] = [
    'Hide Chat (Alt+H)', 'a<b>b</b>c', 'a <b>b</b> c', '<span class="x">Ann</span> <img src="x.png" alt="vip">',
    'Ben <3', 'Ben &lt;3', 'Tom &amp; Jerry', 'a  b', ' lead', 'trail ', 'line\nbreak', 'x<br>y', 'x<br/>y',
    '<p>a</p><p>b</p>', 'R&D', '&nbsp;x', 'a&nbsp;&nbsp;b', '%s recording', '<strong>%s</strong> is typing',
    'Click <a href="https://x.com/?a=1&amp;b=2">here</a>.', '1 < 2 > 0', 'a<i>b</i>',
    'Ann <span class="bm-badge">Pro</span>', '<script>alert(1)</script>Hi', '<style>.a{}</style>Hi',
    'Hi<!-- c -->there', 'Hide Chat (⌥H)', '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>', 'x y', 'tab\there',
    '<b>bold</b>text', 'text<b>bold</b>', 'a <b> b </b> c', '<div>a</div>b', 'a<div>b</div>c', '<foo>x</foo>',
    'a<customtag>b', '<x>', 'a\n<b>b</b>', 'a  <b>b</b>  c', 'a <b>b</b>', 'x &amp;  y', ' &nbsp;x&nbsp; ',
    'a &lt;b&gt; c', '&lt;b&gt;x&lt;/b&gt;', 'Ben VIP<br>', 'a<br><br>b', 'a <br> b', 'é<span>x</span>',
    'x<span></span>y', 'x<span> </span>y', '<span>a</span>.', '(<b>x</b>)', 'a<img src=x>b',
    'Ann <img class="bm-emoji" src="/e.png" alt="😀">', '<b>A</b><i>B</i>', 'A<b>B</b>', '"<b>A</b>"', 'a,<b>b</b>',
    '<span class="wplus-uname">Ann</span> joined', 'a\t<b>b</b>', '<b>x</b>\n', 'x</b></i>.', '(<b><i>x',
    'x</i></b>)', 'a</b><b>,', 'a<b>.</b>', 'a<br><br>.', 'a<b></b>!', 'a<img src=x>!', 'a<img src=x><img src=y>!',
    'a</span> !', '<b>a</b><b>,</b>', 'a<b>)</b>', 'Supports HTML (e.g. <b>, <a href>). See below',
    '<b>Eve</b><sup>2</sup><sub>x</sub><mark>!</mark><u>u</u>', 'Go\n\n<a href="#">here</a> to reply.',
];
