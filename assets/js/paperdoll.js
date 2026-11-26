const SLOTS = [
    [8, "Ring", "ring"], [9, "Ring", "ring"], [0, "Helm", "helm"], [1, "Amulet", "amulet"],
    [2, "Weapon", "mainhand"], [4, "Armor", "armor"], [3, "Off-hand", "offhand"],
    [6, "Gloves", "gloves"], [5, "Belt", "belt"], [7, "Boots", "boots"],
];
const PAPERDOLL_ART = "/assets/img/paperdoll/";
const WHEEL_ART = "/assets/wheel/";
export const UPDATE = "Update the website's game data";
const wheelFiles = new Map();
let nextCard = 0;

function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

export function pictureOf(file) {
    if (typeof file !== "string") return "";
    if (/^[a-f0-9]{32}\.webp$/.test(file)) return `/assets/img/hero-items/${file}`;
    return /^\/arena-results\/[a-z0-9_-]+\/art\/[a-z0-9-]+\.webp$/.test(file) ? file : "";
}

function picture(source, silhouette = false) {
    const image = element("img", silhouette ? "gear__silhouette" : "");
    image.src = source;
    image.alt = "";
    image.decoding = "async";
    return image;
}

function rarityClass(item) {
    return Number.isInteger(item.rarity) ? `item--rarity-${item.rarity}` : "";
}

function itemCard(item) {
    const card = element("div", `item ${rarityClass(item)}`);
    card.append(element("p", "item__name", item.name), element("p", "item__kind", item.summary));
    if (item.lines.length) {
        const lines = element("ul", "");
        lines.append(...item.lines.map(line => element("li", "", line)));
        card.append(lines);
    }
    return card;
}

export function chestItem(item) {
    const row = element("li", "");
    const disclosure = element("details", rarityClass(item));
    const summary = element("summary", "");
    const source = pictureOf(item.image);
    if (source) {
        const thumbnail = picture(source);
        thumbnail.loading = "lazy";
        summary.append(thumbnail);
    }
    const caption = element("span", "");
    caption.append(element("strong", "", item.name), element("small", "", item.summary));
    summary.append(caption);
    disclosure.append(summary, itemCard(item));
    row.append(disclosure);
    return row;
}

export function renderPaperdoll(target, equipment) {
    const gear = element("div", "gear");
    const rings = element("div", "gear__rings");
    gear.append(rings);
    const options = new Map(equipment.map(item => [item.slotIndex, item]));
    const cards = [];
    let closeCard;
    for (const [index, label, silhouette] of SLOTS) {
        const item = options.get(index);
        const cell = element(item ? "button" : "span", `gear__cell ${item ? rarityClass(item) : "gear__cell--empty"}`);
        const icon = pictureOf(item?.image);
        cell.append(picture(icon || `${PAPERDOLL_ART}${silhouette}-silhouette.webp`, !icon));
        if (item) {
            const card = itemCard(item);
            card.id = `equipment-card-${++nextCard}`;
            card.hidden = true;
            cell.type = "button";
            cell.setAttribute("aria-label", `${item.name} · ${item.slot}`);
            cell.setAttribute("aria-controls", card.id);
            cell.setAttribute("aria-expanded", "false");
            cell.append(element("span", "gear__level", item.level));
            cell.addEventListener("click", () => {
                const open = card.hidden;
                closeCard?.();
                if (!open) return;
                card.hidden = false;
                cell.setAttribute("aria-expanded", "true");
                closeCard = () => {
                    card.hidden = true;
                    cell.setAttribute("aria-expanded", "false");
                    closeCard = undefined;
                };
            });
            cards.push(card);
        } else {
            cell.setAttribute("role", "img");
            cell.setAttribute("aria-label", `${label} slot empty`);
        }
        (index === 8 || index === 9 ? rings : gear).append(cell);
    }
    target.removeAttribute("role");
    target.replaceChildren(gear, ...cards);
}

export function loadWheel(version, request = fetch) {
    if (typeof version !== "string" || !/^[a-f0-9]{64}$/.test(version)) return Promise.reject(new Error(UPDATE));
    if (!wheelFiles.has(version)) {
        const pending = request(`${WHEEL_ART}layout-${version}.json`, { cache: "force-cache" }).then(async response => {
            if (!response.ok) throw new Error(UPDATE);
            const layout = await response.json();
            if (!/^backdrop-[a-f0-9]{64}\.webp$/.test(layout.backdrop)) throw new Error(UPDATE);
            return layout;
        }).catch(error => {
            wheelFiles.delete(version);
            throw error;
        });
        wheelFiles.set(version, pending);
    }
    return wheelFiles.get(version);
}

export function chartedLabels(wheel, charted) {
    const byId = new Map(charted.map(node => [node.id, node]));
    const labels = new Map();
    for (const node of wheel.nodes) {
        const state = byId.get(node.id);
        if (!state) continue;
        const level = state.level > 0 ? ` · Level ${state.level}` : "";
        const grant = state.granted ? (state.learned ? " · Imbued" : " · Granted by equipment") : "";
        const label = node.name + level + grant;
        labels.set(label, node.passive ? (labels.get(label) ?? 0) + 1 : 1);
    }
    return Array.from(labels, ([label, count]) => count > 1 ? `${label} ×${count}` : label);
}

export async function renderWheel(target, version, charted) {
    try {
        const wheel = await loadWheel(version);
        const placements = new Map(wheel.nodes.map(node => [node.id, node]));
        if (charted.some(node => !placements.has(node.id))) throw new Error(UPDATE);
        const backdrop = picture(WHEEL_ART + wheel.backdrop);
        await backdrop.decode();
        const canvas = element("canvas", "wheel-picture");
        canvas.width = canvas.height = wheel.size;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", "Skill wheel with learned and equipment-granted nodes highlighted");
        const paint = canvas.getContext("2d");
        paint.drawImage(backdrop, 0, 0);
        paintChart(paint, wheel.edges, placements, charted);
        target.removeAttribute("role");
        target.replaceChildren(canvas);
        return chartedLabels(wheel, charted);
    } catch (error) {
        console.warn("The website could not show the skill wheel:", error);
        target.textContent = UPDATE;
        return undefined;
    }
}

function paintChart(paint, edges, placements, charted) {
    const marked = new Set(charted.map(node => node.id));
    paint.strokeStyle = "#efcb7d";
    paint.lineWidth = 3;
    paint.beginPath();
    for (const [from, to] of edges) {
        if (!marked.has(from) || !marked.has(to)) continue;
        const start = placements.get(from);
        const end = placements.get(to);
        paint.moveTo(start.x, start.y);
        paint.lineTo(end.x, end.y);
    }
    paint.stroke();
    for (const state of charted) {
        const node = placements.get(state.id);
        paint.fillStyle = state.granted ? "#ff9e67" : "#f4d58a";
        paint.beginPath();
        paint.arc(node.x, node.y, node.passive ? 5 : 8, 0, 2 * Math.PI);
        paint.fill();
    }
}
