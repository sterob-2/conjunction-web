import { test } from "node:test";
import assert from "node:assert/strict";
import { accountLinkText } from "../assets/js/account-link.js";

test("accountLinkText offers the sign-in to a tab without a kept session", () => {
    assert.equal(accountLinkText(undefined), "Sign in");
});

test("accountLinkText names the account for a tab that keeps a session", () => {
    assert.equal(accountLinkText({ playerId: "player", sessionToken: "token", endsAt: 1 }), "Your account");
});
