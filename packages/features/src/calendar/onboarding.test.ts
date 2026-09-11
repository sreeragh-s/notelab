import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarConnectionReturnPath } from "./onboarding";

test("connection outcomes retain the initiating workspace without accepting a return origin", () => {
  for (const outcome of ["success", "cancelled"] as const) {
    const url = new URL(calendarConnectionReturnPath("a/b?c&d", outcome), "https://app.example");
    assert.equal(url.origin, "https://app.example");
    assert.equal(url.pathname, "/calendar");
    assert.equal(url.searchParams.get("workspace"), "a/b?c&d");
    assert.equal(url.searchParams.get("connection"), outcome);
  }
});
