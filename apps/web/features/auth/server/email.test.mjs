import assert from "node:assert/strict";
import test from "node:test";
import { isValidAuthActionURL } from "./email.ts";

const origin = "https://chron.example.test";

test("accepts a Better Auth verification link with its token in the query", () => {
  assert.equal(isValidAuthActionURL({
    actionURL: `${origin}/api/auth/verify-email?token=verify-token&callbackURL=%2F`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/verify-email",
    token: "verify-token",
    tokenLocation: "query",
  }), true);
});

test("accepts a Better Auth reset link with its token in the path", () => {
  assert.equal(isValidAuthActionURL({
    actionURL: `${origin}/api/auth/reset-password/reset-token?callbackURL=%2F`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/reset-password",
    token: "reset-token",
    tokenLocation: "path",
  }), true);
});

test("rejects an unexpected origin, route, or token", () => {
  const expected = {
    actionURL: `${origin}/api/auth/reset-password/reset-token`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/reset-password",
    token: "reset-token",
    tokenLocation: "path",
  };

  assert.equal(isValidAuthActionURL({ ...expected, actionURL: "https://attacker.example/reset-token" }), false);
  assert.equal(isValidAuthActionURL({ ...expected, actionURL: `${origin}/reset-token` }), false);
  assert.equal(isValidAuthActionURL({ ...expected, actionURL: `${origin}/api/auth/reset-password/other-token` }), false);
  assert.equal(isValidAuthActionURL({ ...expected, actionURL: `${origin}/api/auth/reset-password/reset-token#fragment` }), false);
});

test("rejects malformed links and tokens in the wrong URL location", () => {
  assert.equal(isValidAuthActionURL({
    actionURL: "not-a-url",
    expectedOrigin: origin,
    expectedPath: "/api/auth/verify-email",
    token: "verify-token",
    tokenLocation: "query",
  }), false);

  assert.equal(isValidAuthActionURL({
    actionURL: `${origin}/api/auth/verify-email?token=other-token`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/verify-email",
    token: "verify-token",
    tokenLocation: "query",
  }), false);
});
