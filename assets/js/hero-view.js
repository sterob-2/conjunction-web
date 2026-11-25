import { browserNet, openTabStorage } from "./browser.js";
import { endsTheSession, forgetSession, keepSession, readHeroViews, refreshAccess, restoreSession } from "./web-session.js";

const UPDATE = "Update the website's game data";
const CANNOT_READ = "This hero could not be read from its cloud backup.";
const TRY_AGAIN = "Your cloud heroes could not be read. Reload the page to try again.";
const BACKUP_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function backupLine(stamp) {
    if (!stamp) return "Backup date unavailable";
    const date = new Date(stamp);
    return Number.isFinite(date.getTime())
        ? `Backed up ${BACKUP_FORMAT.format(date)} from your phone` : "Backup date unavailable";
}

export function heroIndex(hash, count) {
    const number = /^#hero-([1-9]\d*)(?:\/chest)?$/.exec(hash);
    const index = number ? Number(number[1]) - 1 : -1;
    return index < count ? index : -1;
}

export function heroLinks(index) {
    const hero = `#hero-${index + 1}`;
    return { hero, chest: `${hero}/chest` };
}

export function pictureOf(file) {
    return typeof file === "string" && /^[a-f0-9]{32}\.webp$/.test(file)
        ? `/assets/img/hero-items/${file}` : "";
}

export function chestMessage({ items, hasUnreadableItems }) {
    if (hasUnreadableItems) return items.length ? "Some items could not be read from this backup."
        : "The chest could not be read from this backup.";
    return items.length ? "" : "Your chest is empty.";
}

export function heroTitle(hero, index) {
    return hero.status === "ready" ? `${hero.details.name} · Level ${hero.details.level}` : `Cloud hero ${index + 1}`;
}

export function chartedLabels(wheel, charted) {
    const covered = new Map(charted.map(node => [node.id, node]));
    const labels = new Map();
    for (const node of wheel.nodes) {
        const state = covered.get(node.id);
        if (!state) continue;
        const level = state.level > 0 ? ` · Level ${state.level}` : "";
        const grant = state.granted ? (state.learned ? " · Imbued" : " · Granted by equipment") : "";
        const label = node.name + level + grant;
        labels.set(label, node.passive ? (labels.get(label) ?? 0) + 1 : 1);
    }
    return Array.from(labels, ([label, count]) => count > 1 ? `${label} ×${count}` : label);
}

function drawWheel(canvas, wheel, charted) {
    const paint = canvas.getContext("2d");
    const state = new Map(charted.map(node => [node.id, node]));
    const point = node => [node.x * canvas.width, node.y * canvas.height];
    paint.clearRect(0, 0, canvas.width, canvas.height);
    for (const { from, to } of wheel.edges) {
        const a = wheel.nodes[from];
        const b = wheel.nodes[to];
        paint.strokeStyle = state.has(a.id) && state.has(b.id) ? "#ba9462" : "#394257";
        paint.beginPath();
        paint.moveTo(...point(a));
        paint.lineTo(...point(b));
        paint.stroke();
    }
    for (const node of wheel.nodes) {
        const marked = state.get(node.id);
        paint.fillStyle = marked?.granted ? "#ff9e67" : marked ? "#ffe295" : "#68758e";
        paint.beginPath();
        const [x, y] = point(node);
        paint.arc(x, y, node.passive ? 3 : 5, 0, 2 * Math.PI);
        paint.fill();
    }
}

function definitionList(list, entries) {
    list.replaceChildren(...entries.flatMap(([key, value]) => [element("dt", key), element("dd", value)]));
}

function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}

function imageAt(source, size) {
    const picture = document.createElement("img");
    picture.src = source;
    picture.alt = "";
    picture.width = size;
    picture.height = size;
    picture.loading = "lazy";
    return picture;
}

function itemCard(item) {
    const row = document.createElement("li");
    const card = document.createElement("details");
    const summary = document.createElement("summary");
    const text = document.createElement("span");
    text.append(element("strong", item.name), element("small", item.summary));
    const picture = pictureOf(item.image);
    if (picture) summary.append(imageAt(picture, 48));
    summary.append(text);
    card.append(summary);
    const body = document.createElement("div");
    body.className = "hero-item-body";
    if (picture) body.append(imageAt(picture, 128));
    if (item.lines.length) {
        const stats = document.createElement("ul");
        stats.append(...item.lines.map(line => element("li", line)));
        body.append(stats);
    }
    card.append(body);
    row.append(card);
    return row;
}

function start(page, storage) {
    const { status, signIn, overview, list, details } = page;
    const logIn = () => {
        status.textContent = "Sign in to see your cloud heroes.";
        signIn.hidden = false;
    };
    const show = async () => {
        const kept = restoreSession(storage, browserNet.now());
        if (!kept) return logIn();
        const refreshed = await refreshAccess(kept, browserNet);
        if (refreshed.status !== "signedIn") {
            if (!endsTheSession(refreshed.failure)) {
                status.textContent = TRY_AGAIN;
                return;
            }
            forgetSession(storage);
            return logIn();
        }
        keepSession(storage, refreshed.session);
        const result = await readHeroViews(refreshed.session, browserNet);
        if (!result.ok) {
            status.textContent = TRY_AGAIN;
            return;
        }
        const { heroes, wheel } = result.view;
        if (heroes.length === 0) {
            status.textContent = "No cloud backups yet. On your phone, turn on cloud backup in Settings.";
            return;
        }
        list.replaceChildren(...heroes.map((hero, index) => {
            const item = document.createElement("li");
            const link = element("a", heroTitle(hero, index));
            link.href = heroLinks(index).hero;
            item.append(link);
            return item;
        }));
        const route = (focus) => {
            const index = heroIndex(location.hash, heroes.length);
            overview.hidden = index >= 0;
            details.hidden = index < 0;
            const chest = index >= 0 && location.hash === heroLinks(index).chest && heroes[index].status === "ready";
            if (index >= 0) showHero(page, heroes[index], index, wheel, chest);
            if (focus) (index < 0 ? overview.querySelector("h2") : chest ? page.chestTitle : page.name).focus();
        };
        status.hidden = true;
        route(false);
        window.addEventListener("hashchange", () => route(true));
    };
    show().catch(() => {
        status.hidden = false;
        status.textContent = TRY_AGAIN;
    });
    window.addEventListener("pagehide", () => {
        overview.hidden = true;
        details.hidden = true;
    });
    window.addEventListener("pageshow", event => {
        if (event.persisted) location.reload();
    });
}

function showHero(page, card, index, wheel, chest) {
    page.name.textContent = heroTitle(card, index);
    page.backup.textContent = backupLine(card.backedUpUtc);
    page.message.hidden = card.status === "ready";
    page.build.hidden = card.status !== "ready" || chest;
    page.chest.hidden = !chest;
    if (card.status !== "ready") {
        page.message.textContent = card.status === "updateRequired" ? UPDATE : CANNOT_READ;
        return;
    }
    const hero = card.details;
    if (chest) {
        page.chestBack.href = heroLinks(index).hero;
        page.chestItems.replaceChildren(...hero.chest.items.map(itemCard));
        page.chestMessage.textContent = chestMessage(hero.chest);
        page.chestMessage.hidden = !page.chestMessage.textContent;
        return;
    }
    page.chestLink.href = heroLinks(index).chest;
    definitionList(page.attributes, hero.attributes.rows.map(({ name, value }) => [name, value]));
    page.equipment.replaceChildren(...hero.equipment.map(itemCard));
    page.noEquipment.hidden = hero.equipment.length > 0;
    drawWheel(page.wheel, wheel, hero.charted);
    const charted = chartedLabels(wheel, hero.charted);
    page.charted.replaceChildren(...(charted.length ? charted : ["No nodes or skills learned yet"]).map(label => element("li", label)));
}

if (typeof document !== "undefined") {
    const fields = ["status", "sign-in", "overview", "list"];
    const page = Object.fromEntries(fields.map(field => [field === "sign-in" ? "signIn" : field, document.getElementById(`heroes-${field}`)]));
    for (const field of ["details", "name", "backup", "message", "build", "attributes", "equipment", "wheel", "charted", "chest"]) {
        page[field] = document.getElementById(`hero-${field}`);
    }
    for (const [property, id] of Object.entries({
        chestLink: "chest-link", chestBack: "chest-back", chestTitle: "chest-title",
        chestMessage: "chest-message", chestItems: "chest-items", noEquipment: "no-equipment",
    })) {
        page[property] = document.getElementById(`hero-${id}`);
    }
    start(page, openTabStorage());
}
