import { vi } from 'vitest';

// The SDK's calls as the elements script finds them on a page (window.wordplusRealtimeCalls.page()). Each page load is a
// test file of its own: the elements define themselves once per window, as the script does on a real page.
export function pageWithCalls( user : string | null = null ) {
    const calls = {
        on: () => calls,
        off: () => calls,
        start: vi.fn( () => new Promise( () => {} ) ),
        group: vi.fn( () => new Promise( () => {} ) ),
        people: vi.fn( async () => [] ),
    };
    const rt = { user };
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls } ) };
    return calls;
}
