import { test } from "node:test";
import assert from "node:assert/strict";
import { arenaReturnFrom, signInHrefFor } from "../assets/js/arena-return.js";

const SITE = "https://conjunctiongame.com";
const WEEK = "/arena-results/closed/60306/2026-W47.html";

test("signInHrefFor sends the player to the sign-in page with the results page he stands on", () => {
    assert.equal(signInHrefFor(`${WEEK}#0123456789abcdef`),
        "/sign-in.html?next=%2Farena-results%2Fclosed%2F60306%2F2026-W47.html%230123456789abcdef");
});

test("arenaReturnFrom reads back the results page signInHrefFor named, with its hero", () => {
    const href = signInHrefFor(`${WEEK}#0123456789abcdef`);
    assert.equal(arenaReturnFrom(new URL(href, SITE).search, SITE), `${WEEK}#0123456789abcdef`);
});

test("arenaReturnFrom follows no address off the results path or off this site", () => {
    for (const next of ["https://example.com/arena-results/", "//example.com/arena-results/", "/privacy.html",
        "/arena-results/../privacy.html", "javascript:alert(1)", "/arena-results\\..\\x", ""]) {
        const target = arenaReturnFrom(`?${new URLSearchParams({ next })}`, SITE);
        assert.ok(target === undefined || target.startsWith("/arena-results/"), `${next} -> ${target}`);
        assert.notEqual(target, "/privacy.html");
    }
    assert.equal(arenaReturnFrom("", SITE), undefined);
});
