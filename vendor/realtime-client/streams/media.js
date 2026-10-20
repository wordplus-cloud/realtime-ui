/** The room client a rooms script put on the page (window.WordPlusRTC), for an engine given no `media`. */
export function pageMedia() {
    const found = globalThis.WordPlusRTC;
    return found?.Room ? Promise.resolve(found) : Promise.reject(Object.assign(new Error('no_rooms_script'), { code: 'no_rooms_script' }));
}
