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
