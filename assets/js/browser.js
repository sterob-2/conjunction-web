// The browser's parts the sign-in pages hand to web-session.js: the network with the clock, and the tab's storage.

export const browserNet = Object.freeze({ fetch: (url, init) => window.fetch(url, init), now: () => Date.now() });

/** The tab's session storage; where the browser blocks it, the page's memory, so signing in still works until reload. */
export function openTabStorage() {
    try {
        const tab = window.sessionStorage;
        tab.getItem("");
        return tab;
    } catch (blocked) {
        console.warn("This browser blocks the session storage; the website session lives in the page only:", blocked);
        const items = new Map();
        return {
            getItem: key => items.get(key) ?? null,
            setItem: (key, value) => items.set(key, String(value)),
            removeItem: key => items.delete(key),
        };
    }
}
