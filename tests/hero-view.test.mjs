import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { backupLine, chartedLabels, heroIndex, heroTitle } from "../assets/js/hero-view.js";
import { readHeroViews } from "../assets/js/web-session.js";

test("Cloud Code receives the access token and no player or hero identifier", async () => {
    const view = { heroes: [], wheel: { nodes: [], edges: [] } };
    const net = {
        fetch: async (url, request) => {
            assert.match(url, /^https:\/\/cloud-code\.services\.api\.unity\.com\/v1\/projects\/[^/]+\/modules\/HeroView\/List$/);
            assert.equal(request.headers.Authorization, "Bearer child-access");
            assert.equal(request.method, "POST");
            assert.deepEqual(JSON.parse(request.body), { params: {} });
            return new Response(JSON.stringify({ output: JSON.stringify(view) }));
        },
    };
    assert.deepEqual(await readHeroViews({ playerId: "excluded", accessToken: "child-access" }, net), { ok: true, view });
});

test("a malformed projection stays closed", async () => {
    const net = { fetch: async () => new Response(JSON.stringify({ output: { hero: {} } })) };
    assert.equal((await readHeroViews({ accessToken: "child-access" }, net)).ok, false);
});

test("only a listed hero can open, and All heroes goes back to the list", () => {
    assert.equal(heroIndex("#hero-1", 2), 0);
    assert.equal(heroIndex("#hero-2", 2), 1);
    for (const hash of ["#hero-3", "#hero-0", "#hero--1", "#hero-2?x=1", "#heroes", ""]) {
        assert.equal(heroIndex(hash, 2), -1, hash);
    }
});

test("newer heroes have a generic title and keep their cloud backup date", () => {
    assert.equal(heroTitle({ status: "ready", details: { name: "Bran", level: 12 } }, 0), "Bran · Level 12");
    assert.equal(heroTitle({ status: "updateRequired" }, 1), "Cloud hero 2");
    assert.match(backupLine("2026-11-25T12:00:00Z"), /^Backed up Nov 25, 2026, .* from your phone$/);
    assert.equal(backupLine(""), "Backup date unavailable");
});

test("the text alternative distinguishes learned skills, passive nodes, and equipment grants", () => {
    const wheel = { nodes: [
        { id: "sword", name: "Slash" }, { id: "sword-again", name: "Slash" },
        { id: "dexterity", name: "+5 Dexterity", passive: true },
        { id: "dexterity-again", name: "+5 Dexterity", passive: true },
        { id: "guard", name: "Guard" }, { id: "unlearned", name: "Unlearned" },
    ] };
    const charted = [
        { id: "sword", level: 3, learned: true }, { id: "sword-again", level: 3, learned: true },
        { id: "dexterity", level: 0, learned: true }, { id: "dexterity-again", level: 0, learned: true },
        { id: "guard", level: 0, learned: false, granted: true },
    ];
    assert.deepEqual(chartedLabels(wheel, charted), ["Slash · Level 3", "+5 Dexterity ×2", "Guard · Granted by equipment"]);
});

test("both entry points lead to My heroes and hero details link back", async () => {
    const html = name => readFile(new URL(`../${name}.html`, import.meta.url), "utf8");
    assert.match(await html("index"), /data-heroes-link hidden><a href="\/hero.html">My heroes</);
    assert.match(await html("sign-in"), /id="signed-in" hidden>\s*<a[^>]+href="\/hero.html">My heroes</);
    const page = await html("hero");
    assert.match(page, /href="\/sign-in.html">&larr; Your account</);
    assert.match(page, /href="#heroes">&larr; All heroes</);
});
