// The arena results pages show their results only to a player with a website session in this tab (sign-in.html,
// TASK-1506); everyone else sees the page's sign-in panel, whose button leads to the sign-in and back. The layout of
// both is in the page; this only swaps them.
import { signInHrefFor } from "./arena-return.js";
import { browserNet, openTabStorage } from "./browser.js";
import { Failure, endsTheSession, forgetSession, keepSession, refreshAccess, restoreSession } from "./web-session.js";

const LINES = Object.freeze({
    [Failure.RAN_OUT]: "Your website session has ended. Sign in again to see the results.",
    [Failure.REFUSED]: "Your website session is no longer accepted. Sign in again to see the results.",
    [Failure.NOT_SET_UP]: "Signing in is not open on the website yet.",
});

const storage = openTabStorage();
const page = {
    results: document.getElementById("arena-results"),
    gate: document.getElementById("arena-gate"),
    line: document.getElementById("arena-gate-line"),
    signIn: document.getElementById("arena-gate-sign-in"),
};

page.signIn.href = signInHrefFor(location.pathname + location.hash);
openForTheKeptSession().catch(unexpected => {
    console.error("The arena results could not check the website session:", unexpected);
    showGate(LINES[Failure.REFUSED]);
});

/** A kept session opens the results at once; Unity's answer to its refresh then closes them if it ended there. */
async function openForTheKeptSession() {
    const kept = restoreSession(storage, browserNet.now());
    if (!kept) return showGate("");
    showResults();
    const refreshed = await refreshAccess(kept, browserNet);
    if (refreshed.status === "signedIn") return keepSession(storage, refreshed.session);
    if (!endsTheSession(refreshed.failure)) {
        return console.warn(`The website session could not be refreshed (${refreshed.failure}); the results stay open.`);
    }
    forgetSession(storage);
    showGate(LINES[refreshed.failure]);
}

function showResults() {
    page.gate.hidden = true;
    page.results.hidden = false;
}

function showGate(line) {
    page.results.hidden = true;
    page.gate.hidden = false;
    page.line.textContent = line;
    page.line.hidden = line.length === 0;
}
