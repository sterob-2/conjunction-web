// The way from an arena results page to the sign-in and back. The sign-in page follows only a path on this site
// under the results, so a link that names somewhere else can never send a player there after he signs in.

export const ARENA_RESULTS_PATH = "/arena-results/";
const SIGN_IN_PATH = "/sign-in.html";
const RETURN_PARAMETER = "next";

/** The sign-in page's address that brings the player back to the results page he stands on. */
export function signInHrefFor(resultsPath) {
    return `${SIGN_IN_PATH}?${new URLSearchParams({ [RETURN_PARAMETER]: resultsPath })}`;
}

/** The results page the sign-in page was opened from, or none: anything not a results path on this site is ignored. */
export function arenaReturnFrom(search, origin) {
    const asked = new URLSearchParams(search).get(RETURN_PARAMETER);
    if (!asked || !asked.startsWith(ARENA_RESULTS_PATH)) return undefined;
    const target = new URL(asked, origin);
    const onThisSite = target.origin === origin && target.pathname.startsWith(ARENA_RESULTS_PATH);
    return onThisSite ? target.pathname + target.hash : undefined;
}
