import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { backupLine, chestMessage, heroIndex, heroLinks, heroTitle } from "../assets/js/hero-view.js";
import { chartedLabels, chestItem, loadWheel, pictureOf, renderPaperdoll } from "../assets/js/paperdoll.js";
import { readHeroViews } from "../assets/js/web-session.js";

test("Cloud Code receives the access token and no player or hero identifier", async () => {
    const view = { heroes: [], wheelVersion: "1".repeat(64) };
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

test("the versioned wheel is fetched once for concurrent views and subsequent routes", async () => {
    const version = "2".repeat(64);
    const layout = { nodes: [], edges: [], backdrop: `backdrop-${"a".repeat(64)}.webp` };
    let reads = 0;
    const request = async (url, options) => {
        reads++;
        assert.equal(url, `/assets/wheel/layout-${version}.json`);
        assert.deepEqual(options, { cache: "force-cache" });
        return Response.json(layout);
    };
    const opening = loadWheel(version, request);
    assert.strictEqual(loadWheel(version, request), opening);
    assert.deepEqual(await opening, layout);
    assert.deepEqual(await loadWheel(version, request), layout);
    assert.equal(reads, 1);
});

test("an absent version does not fall back to another wheel", async () => {
    const version = "3".repeat(64);
    await assert.rejects(loadWheel(version, async () => new Response("", { status: 404 })), /Update the website/);
    await assert.rejects(loadWheel("../other", () => assert.fail("invalid version issued a request")), /Update the website/);
});

test("only a listed hero can open, and All heroes goes back to the list", () => {
    assert.equal(heroIndex("#hero-1", 2), 0);
    assert.equal(heroIndex("#hero-2", 2), 1);
    for (const hash of ["#hero-3", "#hero-0", "#hero--1", "#hero-2?x=1", "#heroes", ""]) {
        assert.equal(heroIndex(hash, 2), -1, hash);
    }
});

test("the chest route belongs to a listed hero and has a direct route back", () => {
    const { hero, chest } = heroLinks(1);
    assert.equal(hero, "#hero-2");
    assert.equal(chest, "#hero-2/chest");
    assert.equal(heroIndex(chest, 2), 1);
    assert.equal(heroIndex(chest, 1), -1);
    assert.equal(heroIndex("#hero-2/chest/extra", 2), -1);
});

test("unreadable chest items are distinct from an empty chest", () => {
    assert.equal(chestMessage({ items: [] }), "Your chest is empty.");
    assert.equal(chestMessage({ items: [{}] }), "");
    assert.match(chestMessage({ items: [], hasUnreadableItems: true }), /could not be read/);
    assert.match(chestMessage({ items: [{}], hasUnreadableItems: true }), /Some items/);
});

test("item pictures are local files from the hero catalogue", () => {
    const file = "6510f833cc66c5a4cb3f6cafd529527e.webp";
    assert.equal(pictureOf(file), `/assets/img/hero-items/${file}`);
    for (const invalid of [null, `../${file}`, `https://example.com/${file}`, file + "?query"]) {
        assert.equal(pictureOf(invalid), "");
    }
});

test("equipment and chest open the same item card", () => {
    const markup = node => [node.tag, node.className, node.textContent, node.children.map(markup)];
    const previous = globalThis.document;
    globalThis.document = { createElement: tag => ({
        tag, children: [], attributes: {},
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; },
        removeAttribute(name) { delete this.attributes[name]; },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(_, handler) { this.click = handler; },
    }) };
    try {
        const equipment = document.createElement("section");
        const item = { name: "<Galeshard>", summary: "Ring · Legendary · Lvl 28", slotIndex: 8,
            lines: ["Defense Rating: 94"], level: 28, rarity: 5, slot: "Ring" };
        renderPaperdoll(equipment, [item]);
        const [grid, card] = equipment.children;
        const [rings] = grid.children;
        const [button, emptyRing] = rings.children;
        assert.equal(grid.children.length, 9);
        assert.equal(emptyRing.attributes["aria-label"], "Ring slot empty");
        assert.equal(card.hidden, true);
        assert.equal(button.attributes["aria-controls"], card.id);
        button.click();
        assert.equal(card.hidden, false);
        assert.equal(button.attributes["aria-expanded"], "true");
        const chest = chestItem(item);
        assert.deepEqual(markup(card), markup(chest.children[0].children[1]));
        assert.equal(card.children[0].textContent, "<Galeshard>");
        button.click();
        assert.equal(card.hidden, true);
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
});

test("only the shared module creates item-card markup anywhere on the site", async () => {
    const root = new URL("../", import.meta.url);
    const paths = await readdir(root, { recursive: true });
    const markers = /gear__cell|item__name|item--rarity-|hero-item-body/;
    const files = paths.map(path => path.replaceAll("\\", "/")).filter(path =>
        !path.startsWith("tests/") && !path.startsWith("temp/") && !path.startsWith(".git/")
        && /\.(?:html|js|mjs)$/.test(path));
    const owners = [];
    for (const path of files) {
        const source = await readFile(new URL(path, root), "utf8");
        if (markers.test(source)) owners.push(path);
    }
    assert.deepEqual(owners, ["assets/js/paperdoll.js"]);
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
    assert.match(page, /id="hero-chest-link"[^>]*>Chest</);
    assert.match(page, /id="hero-chest-back"[^>]*>&larr; Back to hero</);
    assert.doesNotMatch(page, /<form\b|<input\b|<button\b/i);
});
