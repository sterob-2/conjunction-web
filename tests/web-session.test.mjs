import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ARENA_ENTRY_KEYS, Failure, NOT_LINKED, STORAGE_KEY, WEB_AUDIENCES, WEB_SESSION_SECONDS,
    arenaNamesIn, forgetSession, keepSession, readArenaNames, refreshAccess, restoreSession, signInWithGoogle,
} from "../assets/js/web-session.js";

const NOW = Date.UTC(2026, 10, 24, 9, 0, 0);
const A_WEEK = WEB_SESSION_SECONDS * 1000;

/** Unity as the page meets it: each call is answered by the first route whose method and path match. */
function unity(routes, now = NOW) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url, method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) });
        const route = routes.find(r => r.method === init.method && url.includes(r.path));
        if (!route) throw new Error(`no route for ${init.method} ${url}`);
        if (route.unreached) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify(route.answer ?? {}), { status: route.status ?? 200 });
    };
    return { net: { fetch, now: () => now }, calls };
}

const SIGNED_IN_WITH_GOOGLE = {
    method: "POST", path: "/external-token/google.com",
    answer: { userId: "player-1", idToken: "full-access", sessionToken: "full-session", expiresIn: 3599 },
};
const CHILD_SESSION = {
    method: "POST", path: "/session-token",
    answer: { userId: "player-1", idToken: "web-access", sessionToken: "web-session", expiresIn: 3599 },
};

function memoryStorage(seed = {}) {
    const items = new Map(Object.entries(seed));
    return {
        getItem: key => items.has(key) ? items.get(key) : null,
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key),
        items,
    };
}

function entry(slot, arenaName) {
    return { week: "2026-W47", entry_id: `e${slot}`, slot, arena_name: arenaName, internal_build: false, snapshot: {} };
}

test("signInWithGoogle asks Unity to sign in only, so an unlinked Google account never makes a player", async () => {
    const { net, calls } = unity([SIGNED_IN_WITH_GOOGLE, CHILD_SESSION]);
    await signInWithGoogle("google-id-token", net);
    assert.deepEqual(calls[0].body, { idProvider: "google.com", token: "google-id-token", signInOnly: true });
});

test("signInWithGoogle swaps the first session for a child scoped to Cloud Save and Cloud Code for a week", async () => {
    const { net, calls } = unity([SIGNED_IN_WITH_GOOGLE, CHILD_SESSION]);
    const outcome = await signInWithGoogle("google-id-token", net);
    assert.deepEqual(calls[1].body, { sessionToken: "full-session", audiences: ["cloud-save", "cloud-code"], ttlSeconds: 604800 });
    assert.equal(outcome.status, "signedIn");
    assert.deepEqual(outcome.session, {
        playerId: "player-1", sessionToken: "web-session", endsAt: NOW + A_WEEK,
        access: { token: "web-access", endsAt: NOW + 3599 * 1000 },
    });
});

test("the website session lives days, not a year", () => {
    assert.equal(WEB_SESSION_SECONDS, 7 * 24 * 3600);
    assert.ok(WEB_SESSION_SECONDS < 365 * 24 * 3600);
    assert.deepEqual([...WEB_AUDIENCES], ["cloud-save", "cloud-code"]);
});

test("signInWithGoogle keeps nothing of the first session in what it hands back", async () => {
    const { net } = unity([SIGNED_IN_WITH_GOOGLE, CHILD_SESSION]);
    const outcome = await signInWithGoogle("google-id-token", net);
    assert.doesNotMatch(JSON.stringify(outcome), /full-session|full-access/);
});

test("a Google account no account is linked to comes back as not linked", async () => {
    const { net, calls } = unity([{ method: "POST", path: "/external-token/google.com", status: 404,
        answer: { status: 404, title: "RESOURCE_NOT_FOUND", detail: "player not found" } }]);
    assert.equal(await signInWithGoogle("google-id-token", net), NOT_LINKED);
    assert.equal(calls.length, 1);
});

test("a project without Unity's Google provider is a set-up failure, never an unlinked account", async () => {
    const { net } = unity([{ method: "POST", path: "/external-token/google.com", status: 404,
        answer: { status: 404, title: "RESOURCE_NOT_FOUND", detail: "id provider not found" } }]);
    const outcome = await signInWithGoogle("google-id-token", net);
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.failure, Failure.NOT_SET_UP);
});

test("no answer from Unity is told as unreachable", async () => {
    const { net } = unity([{ method: "POST", path: "/external-token/google.com", unreached: true }]);
    assert.equal((await signInWithGoogle("google-id-token", net)).failure, Failure.UNREACHABLE);
});

test("a busy Unity is told as busy", async () => {
    for (const status of [429, 503]) {
        const { net } = unity([{ method: "POST", path: "/external-token/google.com", status, answer: { status } }]);
        assert.equal((await signInWithGoogle("google-id-token", net)).failure, Failure.BUSY);
    }
});

test("a Google token Unity refuses is refused, and nothing is signed in", async () => {
    const { net, calls } = unity([{ method: "POST", path: "/external-token/google.com", status: 401,
        answer: { status: 401, title: "PERMISSION_DENIED", detail: "invalid audience" } }]);
    const outcome = await signInWithGoogle("google-id-token", net);
    assert.equal(outcome.failure, Failure.REFUSED);
    assert.equal(calls.length, 1);
});

test("a refused swap signs nothing in", async () => {
    const { net } = unity([SIGNED_IN_WITH_GOOGLE, { method: "POST", path: "/session-token", status: 400,
        answer: { status: 400, title: "INVALID_PARAMETERS" } }]);
    const outcome = await signInWithGoogle("google-id-token", net);
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.failure, Failure.REFUSED);
});

test("refreshAccess presents only the kept child session and keeps its end date", async () => {
    const kept = { playerId: "player-1", sessionToken: "web-session", endsAt: NOW + 1000 };
    const { net, calls } = unity([{ ...CHILD_SESSION, answer: { ...CHILD_SESSION.answer, idToken: "web-access-2" } }]);
    const outcome = await refreshAccess(kept, net);
    assert.deepEqual(calls[0].body, { sessionToken: "web-session" });
    assert.equal(outcome.session.access.token, "web-access-2");
    assert.equal(outcome.session.endsAt, NOW + 1000);
});

test("a session Unity says ran out is told as ran out", async () => {
    const kept = { playerId: "player-1", sessionToken: "web-session", endsAt: NOW + 1000 };
    const { net } = unity([{ method: "POST", path: "/session-token", status: 401,
        answer: { status: 401, title: "INVALID_SESSION_TOKEN", detail: "The session token has expired." } }]);
    assert.equal((await refreshAccess(kept, net)).failure, Failure.RAN_OUT);
});

test("a session past its end date is not presented to Unity at all", async () => {
    const kept = { playerId: "player-1", sessionToken: "web-session", endsAt: NOW };
    const { net, calls } = unity([CHILD_SESSION]);
    assert.equal((await refreshAccess(kept, net)).failure, Failure.RAN_OUT);
    assert.equal(calls.length, 0);
});

test("readArenaNames reads the player's arena entries with the website's access", async () => {
    const session = { playerId: "player-1", sessionToken: "web-session", endsAt: NOW + A_WEEK,
        access: { token: "web-access", endsAt: NOW + 3599000 } };
    const { net, calls } = unity([{ method: "GET", path: "/players/player-1/items",
        answer: { results: [{ key: "arenaEntry2", value: entry(2, "Grimwald") }] } }]);
    const read = await readArenaNames(session, net);
    assert.deepEqual(read, { ok: true, names: [{ arenaName: "Grimwald", slot: 2, track: "Arena" }] });
    assert.equal(calls[0].headers.Authorization, "Bearer web-access");
    for (const key of ARENA_ENTRY_KEYS) assert.match(calls[0].url, new RegExp(`keys=${key}(&|$)`));
});

test("arenaNamesIn lists each track's entries in slot order and skips values the game never writes", () => {
    const names = arenaNamesIn([
        { key: "arenaTestEntry1", value: entry(1, "Ash") },
        { key: "arenaEntry3", value: entry(3, "  Brann  ") },
        { key: "arenaEntry1", value: entry(1, "Cora") },
        { key: "arenaEntry2", value: { arena_name: 7 } },
        { key: "arenaWeek", value: "2026-W47" },
    ]);
    assert.deepEqual(names, [
        { arenaName: "Cora", slot: 1, track: "Arena" },
        { arenaName: "Brann", slot: 3, track: "Arena" },
        { arenaName: "Ash", slot: 1, track: "Test arena" },
    ]);
});

test("keepSession stores the child session and its end, never an access token", () => {
    const storage = memoryStorage();
    keepSession(storage, { playerId: "player-1", sessionToken: "web-session", endsAt: NOW + A_WEEK,
        access: { token: "web-access", endsAt: NOW + 3599000 } });
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)),
        { playerId: "player-1", sessionToken: "web-session", endsAt: NOW + A_WEEK });
});

test("restoreSession hands back a kept session before its end", () => {
    const kept = { playerId: "player-1", sessionToken: "web-session", endsAt: NOW + 1 };
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(kept) });
    assert.deepEqual(restoreSession(storage, NOW), kept);
});

test("restoreSession drops a session at its end", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ playerId: "p", sessionToken: "s", endsAt: NOW }) });
    assert.equal(restoreSession(storage, NOW), undefined);
    assert.equal(storage.getItem(STORAGE_KEY), null);
});

test("restoreSession drops what this page never wrote", () => {
    for (const foreign of [JSON.stringify({ playerId: "p" }), JSON.stringify("text")]) {
        const storage = memoryStorage({ [STORAGE_KEY]: foreign });
        assert.equal(restoreSession(storage, NOW), undefined);
        assert.equal(storage.getItem(STORAGE_KEY), null);
    }
});

test("restoreSession says so when it drops a session it cannot read", t => {
    const warn = t.mock.method(console, "warn", () => {});
    const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
    assert.equal(restoreSession(storage, NOW), undefined);
    assert.equal(storage.getItem(STORAGE_KEY), null);
    assert.equal(warn.mock.callCount(), 1);
});

test("forgetSession, the sign-out, leaves no session in the tab", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ playerId: "p", sessionToken: "s", endsAt: NOW + 1 }) });
    forgetSession(storage);
    assert.equal(storage.getItem(STORAGE_KEY), null);
    assert.equal(restoreSession(storage, NOW), undefined);
});
