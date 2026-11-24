// The sign-in page: Google's button, the player's arena names once signed in, and Sign out. The layout is all in
// sign-in.html; this only shows and hides its parts and fills the list.
import {
    Failure, GOOGLE_CLIENT_ID, forgetSession, keepSession, readArenaNames, refreshAccess, restoreSession,
    signInWithGoogle,
} from "./web-session.js";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

const LINES = Object.freeze({
    notLinked: "This Google account is not linked to a Conjunction account, so nothing was signed in and nothing "
        + "was created. In the game, open Settings, then Gameplay, then Account, and tap Link with Google. Then "
        + "sign in here again.",
    [Failure.UNREACHABLE]: "The sign-in service could not be reached. Check your connection and try again.",
    [Failure.BUSY]: "The sign-in service is busy. Wait a minute and try again.",
    [Failure.NOT_SET_UP]: "Signing in with Google is not open on the website yet.",
    [Failure.REFUSED]: "The sign-in service did not accept this sign-in. Try again, or write to "
        + "info@conjunctiongame.com.",
    [Failure.RAN_OUT]: "Your website session has ended. Sign in again.",
    signedOut: "You are signed out.",
    googleUnreachable: "Google's sign-in could not be loaded. Check your connection and reload the page.",
    namesUnread: "You are signed in, but your arena names could not be read just now. Reload the page to try again.",
});

const net = { fetch: (url, init) => window.fetch(url, init), now: () => Date.now() };
const storage = window.sessionStorage;
const page = {
    line: document.getElementById("sign-in-line"),
    signedOut: document.getElementById("signed-out"),
    signedIn: document.getElementById("signed-in"),
    googleButton: document.getElementById("google-button"),
    names: document.getElementById("arena-names"),
    noNames: document.getElementById("no-arena-names"),
    signOut: document.getElementById("sign-out"),
};

let googleReady;

page.signOut.addEventListener("click", signOut);
start();

async function start() {
    const kept = restoreSession(storage, net.now());
    if (!kept) return offerGoogle();
    const refreshed = await refreshAccess(kept, net);
    if (refreshed.status === "signedIn") return showSignedIn(refreshed.session);
    forgetSession(storage);
    report(refreshed);
    return offerGoogle();
}

async function onGoogleCredential(response) {
    say("");
    const outcome = await signInWithGoogle(response.credential, net);
    if (outcome.status !== "signedIn") return report(outcome);
    keepSession(storage, outcome.session);
    return showSignedIn(outcome.session);
}

async function showSignedIn(session) {
    page.signedOut.hidden = true;
    page.signedIn.hidden = false;
    const read = await readArenaNames(session, net);
    if (!read.ok) {
        console.warn("The arena names could not be read:", describe(read.answer));
        return say(LINES.namesUnread);
    }
    listArenaNames(read.names);
}

function listArenaNames(names) {
    page.names.replaceChildren(...names.map(name => {
        const item = document.createElement("li");
        item.textContent = `${name.arenaName} — ${name.track}, hero slot ${name.slot}`;
        return item;
    }));
    page.noNames.hidden = names.length > 0;
}

function signOut() {
    forgetSession(storage);
    window.google?.accounts.id.disableAutoSelect();
    page.names.replaceChildren();
    say(LINES.signedOut);
    offerGoogle();
}

async function offerGoogle() {
    page.signedIn.hidden = true;
    page.signedOut.hidden = false;
    try {
        await loadGoogle();
    } catch (unloaded) {
        console.warn(unloaded.message);
        return say(LINES.googleUnreachable);
    }
    window.google.accounts.id.renderButton(page.googleButton, {
        type: "standard", theme: "filled_black", size: "large", text: "signin_with", shape: "rectangular",
        logo_alignment: "left", width: 280, locale: "en",
    });
}

/** Google's script is fetched only when the button is needed, and set up once; a failed fetch is tried again later. */
function loadGoogle() {
    googleReady ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = GOOGLE_SCRIPT;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Google's sign-in script did not load from ${GOOGLE_SCRIPT}`));
        document.head.append(script);
    }).then(() => window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential, auto_select: false, ux_mode: "popup",
        context: "signin",
    }), unloaded => {
        googleReady = undefined;
        throw unloaded;
    });
    return googleReady;
}

function report(outcome) {
    if (outcome.status === "notLinked") return say(LINES.notLinked);
    console.warn(`Sign-in failed (${outcome.failure}):`, describe(outcome.answer));
    say(LINES[outcome.failure]);
}

function describe(answer) {
    return answer ? `${answer.status} ${answer.title ?? ""} ${answer.detail ?? ""}`.trim() : "no call made";
}

function say(text) {
    page.line.textContent = text;
    page.line.hidden = text.length === 0;
}
