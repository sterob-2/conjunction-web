import { browserNet, openTabStorage } from "./browser.js";
import { chestItem, renderPaperdoll, renderWheel, UPDATE } from "./paperdoll.js";
import { endsTheSession, forgetSession, keepSession, readHeroViews, refreshAccess, restoreSession } from "./web-session.js";

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

export function chestMessage({ items, hasUnreadableItems }) {
    if (hasUnreadableItems) return items.length ? "Some items could not be read from this backup."
        : "The chest could not be read from this backup.";
    return items.length ? "" : "Your chest is empty.";
}

export function heroTitle(hero, index) {
    return hero.status === "ready" ? `${hero.details.name} · Level ${hero.details.level}` : `Cloud hero ${index + 1}`;
}

function definitionList(list, entries) {
    list.replaceChildren(...entries.flatMap(([key, value]) => [element("dt", key), element("dd", value)]));
}

function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
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
        const { heroes, wheelVersion } = result.view;
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
            if (index >= 0) showHero(page, heroes[index], index, wheelVersion, chest);
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

function showHero(page, card, index, wheelVersion, chest) {
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
        page.chestItems.replaceChildren(...hero.chest.items.map(chestItem));
        page.chestMessage.textContent = chestMessage(hero.chest);
        page.chestMessage.hidden = !page.chestMessage.textContent;
        return;
    }
    page.chestLink.href = heroLinks(index).chest;
    definitionList(page.attributes, hero.attributes.rows.map(({ name, value }) => [name, value]));
    renderPaperdoll(page.equipment, hero.equipment);
    performance.mark("hero-paperdoll");
    showWheel(page, wheelVersion, hero.charted);
}

async function showWheel(page, version, charted) {
    const placeholder = element("div", "Loading skill wheel…");
    placeholder.setAttribute("role", "status");
    page.wheel.replaceChildren(placeholder);
    page.charted.replaceChildren();
    const labels = await renderWheel(placeholder, version, charted);
    if (labels && page.wheel.contains(placeholder)) {
        page.charted.replaceChildren(...(labels.length ? labels : ["No nodes or skills learned yet"]).map(label => element("li", label)));
    }
}

if (typeof document !== "undefined") {
    const fields = ["status", "sign-in", "overview", "list"];
    const page = Object.fromEntries(fields.map(field => [field === "sign-in" ? "signIn" : field, document.getElementById(`heroes-${field}`)]));
    for (const field of ["details", "name", "backup", "message", "build", "attributes", "equipment", "wheel", "charted", "chest"]) {
        page[field] = document.getElementById(`hero-${field}`);
    }
    for (const [property, id] of Object.entries({
        chestLink: "chest-link", chestBack: "chest-back", chestTitle: "chest-title",
        chestMessage: "chest-message", chestItems: "chest-items",
    })) {
        page[property] = document.getElementById(`hero-${id}`);
    }
    start(page, openTabStorage());
}
