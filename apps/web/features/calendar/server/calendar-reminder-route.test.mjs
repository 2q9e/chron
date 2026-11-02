import assert from "node:assert/strict";
import test from "node:test";

const authSettingNames = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DATABASE_URL"];
const previousAuthSettings = new Map(
  authSettingNames.map((name) => [name, process.env[name]]),
);
for (const name of authSettingNames) delete process.env[name];

let post;
try {
  ({ POST: post } = await import("../../../app/api/internal/calendar-reminders/route.ts"));
} finally {
  for (const [name, value] of previousAuthSettings) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("the reminder route imports without runtime auth or database credentials", () => {
  assert.equal(typeof post, "function");
});

test("the reminder route rejects an unauthorized request before opening the database", async () => {
  const response = await post(new Request(
    "https://testing.uwu.markets/api/internal/calendar-reminders",
    { method: "POST" },
  ));

  assert.equal(response.status, 404);
});
