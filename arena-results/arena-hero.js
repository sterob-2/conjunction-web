import { renderPaperdoll, renderWheel } from "/assets/js/paperdoll.js";

const results = document.getElementById("arena-results");
const rendered = new Set();
let week;

async function renderSelectedHero() {
    if (results.hidden) return;
    const entry = results.querySelector(".entry:target") ??
        (wide.matches ? results.querySelector(".entry") : null);
    if (!entry || rendered.has(entry)) return;
    rendered.add(entry);
    const gear = entry.querySelector("[data-paperdoll]");
    const wheel = entry.querySelector("[data-wheel]");
    try {
        week ??= fetch(results.dataset.week).then(response => {
            if (!response.ok) throw new Error(`Week data returned ${response.status}`);
            return response.json();
        });
        const { rows, wheelVersion } = await week;
        const { hero } = rows.find(row => row.row_id === entry.id);
        renderPaperdoll(gear, hero.cards);
        await renderWheel(wheel, wheelVersion, hero.charted);
    } catch (error) {
        console.warn("Arena hero could not be read:", error);
        gear.textContent = "Equipment could not be loaded. Reload the page to try again.";
        wheel.textContent = "Skill wheel could not be loaded.";
    }
}

const wide = window.matchMedia("(min-width: 1000px)");
wide.addEventListener("change", renderSelectedHero);
window.addEventListener("hashchange", renderSelectedHero);
new MutationObserver(renderSelectedHero).observe(results, { attributes: true, attributeFilter: ["hidden"] });
renderSelectedHero();

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-group] button[aria-controls]");
    if (!button) return;

    const group = button.closest("[data-card-group]");
    const previous = group.querySelector('button[aria-expanded="true"]');
    if (previous) {
        previous.setAttribute("aria-expanded", "false");
        document.getElementById(previous.getAttribute("aria-controls")).hidden = true;
    }
    if (previous !== button) {
        button.setAttribute("aria-expanded", "true");
        document.getElementById(button.getAttribute("aria-controls")).hidden = false;
    }
});
