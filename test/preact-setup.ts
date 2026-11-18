// The Preact project's test DOM (vitest.config.ts): Preact names a DOM event by the element's own `on…` property, as
// every browser has one for each (`ondragenter` in a div, so onDragEnter listens to "dragenter"), and happy-dom has
// none for dragging. Without them Preact would listen to "DragEnter", which no browser sends: given here as a browser
// gives them, so the tests see the parts as a page does.
for ( const name of [ 'ondragenter', 'ondragover', 'ondragleave', 'ondrop', 'ondragstart', 'ondragend', 'ondrag' ] ) {
    if ( typeof HTMLElement !== 'undefined' && ! ( name in HTMLElement.prototype ) ) {
        Object.defineProperty( HTMLElement.prototype, name, { value: null, writable: true, configurable: true } );
    }
}
