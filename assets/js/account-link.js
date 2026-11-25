// The site's link to the sign-in page names what it opens: the sign-in for a signed-out tab, the account for a tab
// that holds a website session. Nothing is sent anywhere; the kept session is only read.

import { browserNet, openTabStorage } from "./browser.js";
import { restoreSession } from "./web-session.js";

export const ACCOUNT_LINK_SELECTOR = "[data-account-link]";

const LINES = Object.freeze({ signIn: "Sign in", yourAccount: "Your account" });

/** The link's words for a tab with or without a kept session. */
export function accountLinkText(keptSession) {
    return keptSession ? LINES.yourAccount : LINES.signIn;
}

function nameTheAccountLinks() {
    const text = accountLinkText(restoreSession(openTabStorage(), browserNet.now()));
    for (const link of document.querySelectorAll(ACCOUNT_LINK_SELECTOR)) link.textContent = text;
}

if (typeof document !== "undefined") nameTheAccountLinks();
