import assert from "node:assert/strict";
import test from "node:test";
import { AuthConfigurationError, loadAuthEnvironment } from "./environment.ts";

const validEnvironment = (overrides = {}) => ({
  NODE_ENV: "development",
  BETTER_AUTH_SECRET: "synthetic-test-secret-with-32-bytes-minimum",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://chron:synthetic-test-password@localhost:5432/chron_test",
  ...overrides,
});

test("accepts a local PostgreSQL configuration without enabling remote TLS", () => {
  const config = loadAuthEnvironment(validEnvironment());

  assert.equal(config.baseURL, "http://localhost:3000");
  assert.equal(config.databaseTls, false);
  assert.deepEqual(config.trustedProxies, []);
});

test("requires a sufficiently long Better Auth secret", () => {
  assert.throws(
    () => loadAuthEnvironment(validEnvironment({ BETTER_AUTH_SECRET: "short" })),
    (error) => error instanceof AuthConfigurationError && /32 bytes/.test(error.message),
  );
});

test("requires a PostgreSQL URL and does not accept TLS overrides in its query", () => {
  assert.throws(
    () => loadAuthEnvironment(validEnvironment({ DATABASE_URL: "sqlite://local" })),
    AuthConfigurationError,
  );
  assert.throws(
    () => loadAuthEnvironment(validEnvironment({
      DATABASE_URL: "postgresql://chron:secret@db.example.test/chron?sslmode=require",
    })),
    (error) => error instanceof AuthConfigurationError && /TLS options/.test(error.message),
  );
});

test("requires verified TLS for remote databases", () => {
  const config = loadAuthEnvironment(validEnvironment({
    DATABASE_URL: "postgresql://chron:synthetic-test-password@db.example.test/chron",
  }));

  assert.equal(config.databaseTls, true);
});

test("production requires HTTPS and a bounded, explicit trusted-proxy list", () => {
  const base = {
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://chron.example.test",
    DATABASE_URL: "postgresql://chron:synthetic-test-password@db.example.test/chron",
  };

  assert.throws(
    () => loadAuthEnvironment(validEnvironment({
      ...base,
      BETTER_AUTH_URL: "http://chron.example.test",
      AUTH_TRUSTED_PROXY_CIDRS: "192.0.2.10/32",
    })),
    (error) => error instanceof AuthConfigurationError && /HTTPS/.test(error.message),
  );

  assert.throws(
    () => loadAuthEnvironment(validEnvironment({ ...base, AUTH_TRUSTED_PROXY_CIDRS: "" })),
    (error) => error instanceof AuthConfigurationError && /reverse-proxy/.test(error.message),
  );

  assert.throws(
    () => loadAuthEnvironment(validEnvironment({ ...base, AUTH_TRUSTED_PROXY_CIDRS: "0.0.0.0/0" })),
    (error) => error instanceof AuthConfigurationError && /bounded CIDR/.test(error.message),
  );

  const config = loadAuthEnvironment(validEnvironment({
    ...base,
    AUTH_TRUSTED_PROXY_CIDRS: "192.0.2.10/32,2001:db8::1/128",
  }));

  assert.equal(config.production, true);
  assert.equal(config.databaseTls, true);
  assert.deepEqual(config.trustedProxies, ["192.0.2.10/32", "2001:db8::1/128"]);
});
