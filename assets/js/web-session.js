// The website's sign-in to a player's cloud account: Google's ID token signs in to the account linked to that Google
// account in the game and never makes a new one, and the first session is swapped at once for a child session that
// only Cloud Save and Cloud Code accept and that ends after days. Measured from this origin on 2026-11-24 (game repo,
// docs/evidence/task-1506/). No DOM in here: the page passes in the network, the clock and the storage.

const PROJECT_ID = "c06069c5-7c65-4890-9e21-73686c2bd25b";
const ENVIRONMENT = "production";
const AUTHENTICATION = "https://player-auth.services.api.unity.com/v1/authentication";
const PLAYER_DATA = `https://cloud-save.services.api.unity.com/v1/data/projects/${PROJECT_ID}/players`;
const HERO_VIEW = `https://cloud-code.services.api.unity.com/v1/projects/${PROJECT_ID}/modules/HeroView/List`;
const GOOGLE_PROVIDER = "google.com";

// Unity's answer when the project has no Google provider; every other "not found" of a sign-in-only call is the
// missing account, which the game reads the same way.
const PROVIDER_MISSING = "id provider not found";
const SESSION_RAN_OUT = "INVALID_SESSION_TOKEN";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERRORS = 500;
const MILLISECONDS = 1000;

/** The web client that Unity's Google provider names, the same one the game's Link with Google signs in with. */
export const GOOGLE_CLIENT_ID = "707037398277-vifo4ajj9oh0qauop6gkiko7nao0uv00.apps.googleusercontent.com";

/** The only services the website's session reaches; Unity refuses it everywhere else, account changes included. */
export const WEB_AUDIENCES = Object.freeze(["cloud-save", "cloud-code"]);

/** A website session lasts a week, the arena's rhythm, and is never refreshed beyond it. */
export const WEB_SESSION_SECONDS = 7 * 24 * 60 * 60;

export const STORAGE_KEY = "conjunction.webSession";

/** Why a step failed, each with its own line on the page. */
export const Failure = Object.freeze({
    UNREACHABLE: "unreachable",
    BUSY: "busy",
    NOT_SET_UP: "notSetUp",
    REFUSED: "refused",
    RAN_OUT: "ranOut",
});

/** The arena's tracks with the key prefix each writes its entries under (game repo, ArenaKeys). */
export const ARENA_TRACKS = Object.freeze([
    Object.freeze({ prefix: "arena", label: "Arena" }),
    Object.freeze({ prefix: "arenaTest", label: "Test arena" }),
]);

const HERO_SLOTS = Object.freeze([1, 2, 3]);

export const ARENA_ENTRY_KEYS = Object.freeze(
    ARENA_TRACKS.flatMap(track => HERO_SLOTS.map(slot => `${track.prefix}Entry${slot}`)));

export const signedIn = session => ({ status: "signedIn", session });
export const NOT_LINKED = Object.freeze({ status: "notLinked" });
export const failed = (failure, answer) => ({ status: "failed", failure, answer });

/**
 * Signs in to the cloud account that Google account is linked to in the game: sign-in only, so a Google account the game
 * never linked makes no player and comes back as NOT_LINKED.
 */
export async function signInWithGoogle(googleIdToken, net) {
    const first = await call(net, "POST", `${AUTHENTICATION}/external-token/${GOOGLE_PROVIDER}`,
        { body: { idProvider: GOOGLE_PROVIDER, token: googleIdToken, signInOnly: true } });
    if (first.ok) return swapForTheWebSession(first.body, net);
    return isTheMissingAccount(first) ? NOT_LINKED : failed(failureOf(first), first);
}

/** The first session's token is presented once, for the child, and then dropped; it never reaches the storage. */
async function swapForTheWebSession(firstSession, net) {
    const startedAt = net.now();
    const child = await call(net, "POST", `${AUTHENTICATION}/session-token`, {
        body: { sessionToken: firstSession.sessionToken, audiences: WEB_AUDIENCES, ttlSeconds: WEB_SESSION_SECONDS },
    });
    if (!child.ok) return failed(failureOf(child), child);
    return signedIn({
        playerId: child.body.userId,
        sessionToken: child.body.sessionToken,
        endsAt: startedAt + WEB_SESSION_SECONDS * MILLISECONDS,
        accessToken: child.body.idToken,
    });
}

/** A fresh access for a session kept from earlier; Unity keeps the child's services and end date on every refresh. */
export async function refreshAccess(session, net) {
    if (hasEnded(session, net.now())) return failed(Failure.RAN_OUT);
    const refreshed = await call(net, "POST", `${AUTHENTICATION}/session-token`,
        { body: { sessionToken: session.sessionToken } });
    if (!refreshed.ok) return failed(failureOf(refreshed), refreshed);
    return signedIn({ ...session, sessionToken: refreshed.body.sessionToken, accessToken: refreshed.body.idToken });
}

/** Whether a failed refresh means the kept session is no good any more; no answer or a busy service leaves it be. */
export function endsTheSession(failure) {
    return failure !== Failure.UNREACHABLE && failure !== Failure.BUSY;
}

/** The arena names of the player's handed-in heroes, as the game wrote them into his entries; read only. */
export async function readArenaNames(session, net) {
    const query = ARENA_ENTRY_KEYS.map(key => `keys=${encodeURIComponent(key)}`).join("&");
    const read = await call(net, "GET", `${PLAYER_DATA}/${encodeURIComponent(session.playerId)}/items?${query}`,
        { access: session.accessToken });
    if (!read.ok) return { ok: false, failure: failureOf(read), answer: read };
    return { ok: true, names: arenaNamesIn(read.body.results ?? []) };
}

/** Each entry the game writes, in track and slot order; a value the game never writes counts as no entry. */
export function arenaNamesIn(items) {
    const byKey = new Map(items.map(item => [item.key, item.value]));
    return ARENA_TRACKS.flatMap(track => HERO_SLOTS.flatMap(slot => {
        const entry = byKey.get(`${track.prefix}Entry${slot}`);
        const named = entry && typeof entry.arena_name === "string" && entry.arena_name.trim().length > 0;
        return named ? [{ arenaName: entry.arena_name.trim(), slot, track: track.label }] : [];
    }));
}

/** Reads the signed-in player's projected heroes using the Cloud Code audience. */
export async function readHeroViews(session, net) {
    const read = await call(net, "POST", HERO_VIEW, { access: session.accessToken, body: { params: {} } });
    if (!read.ok) return { ok: false, failure: failureOf(read) };
    const view = typeof read.body.output === "string" ? bodyOf(read.body.output) : read.body.output;
    if (!Array.isArray(view?.heroes) || !Array.isArray(view.wheel?.nodes) || !Array.isArray(view.wheel?.edges)) {
        return { ok: false, failure: Failure.REFUSED };
    }
    return { ok: true, view };
}

/** Keeps the session in the tab's storage without its access token, which every page load asks for anew. */
export function keepSession(storage, session) {
    const { playerId, sessionToken, endsAt } = session;
    storage.setItem(STORAGE_KEY, JSON.stringify({ playerId, sessionToken, endsAt }));
}

/** The session kept in this tab, or none: one that ended or that this page never wrote is dropped. */
export function restoreSession(storage, now) {
    const kept = readKept(storage);
    if (kept && !hasEnded(kept, now)) return kept;
    forgetSession(storage);
    return undefined;
}

export function forgetSession(storage) {
    storage.removeItem(STORAGE_KEY);
}

function readKept(storage) {
    try {
        const kept = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
        const whole = kept && typeof kept.playerId === "string" && typeof kept.sessionToken === "string"
            && Number.isFinite(kept.endsAt);
        return whole ? kept : undefined;
    } catch (unreadable) {
        console.warn("The kept website session could not be read and is dropped:", unreadable);
        return undefined;
    }
}

function hasEnded(session, now) {
    return now >= session.endsAt;
}

function isTheMissingAccount(answer) {
    return answer.status === NOT_FOUND && answer.detail !== PROVIDER_MISSING;
}

function failureOf(answer) {
    if (answer.status === 0) return Failure.UNREACHABLE;
    if (answer.status === TOO_MANY_REQUESTS || answer.status >= SERVER_ERRORS) return Failure.BUSY;
    if (answer.status === NOT_FOUND && answer.detail === PROVIDER_MISSING) return Failure.NOT_SET_UP;
    if (answer.status === UNAUTHORIZED && answer.title === SESSION_RAN_OUT) return Failure.RAN_OUT;
    return Failure.REFUSED;
}

/** One call to Unity: the answer's status, body and RFC 7807 title and detail; status 0 when no whole answer came. */
async function call(net, method, url, { body, access } = {}) {
    const headers = { "ProjectId": PROJECT_ID, "UnityEnvironment": ENVIRONMENT, "Error-Version": "v1" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (access !== undefined) headers["Authorization"] = `Bearer ${access}`;
    let response, text;
    try {
        response = await net.fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        text = await response.text();
    } catch (unreached) {
        return { ok: false, status: 0, detail: String(unreached) };
    }
    const answer = bodyOf(text);
    return { ok: response.ok, status: response.status, body: answer, title: answer.title, detail: answer.detail };
}

/** The answer's JSON object; anything else is kept as its detail. */
function bodyOf(text) {
    try {
        const parsed = text ? JSON.parse(text) : {};
        return parsed !== null && typeof parsed === "object" ? parsed : { detail: text };
    } catch (notJson) {
        return { detail: text };
    }
}
