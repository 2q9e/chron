import { isIP } from "node:net";

export type AuthEnvironment = Readonly<{
  baseURL: string;
  databaseURL: string;
  databaseTls: boolean;
  databaseTlsCA?: string;
  production: boolean;
  secret: string;
  trustedProxies: string[];
}>;

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function requiredValue(
  environment: Record<string, string | undefined>,
  name: string,
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new AuthConfigurationError(`Missing required authentication setting: ${name}`);
  }

  return value;
}

function isLoopback(hostname: string): boolean {
  const host = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isValidProxyRange(value: string): boolean {
  const [address, prefix, extra] = value.split("/");

  if (!address || extra !== undefined) return false;

  const version = isIP(address);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;

  const bits = Number(prefix);
  const maximum = version === 4 ? 32 : 128;
  const minimum = version === 4 ? 16 : 32;

  return Number.isInteger(bits) && bits >= minimum && bits <= maximum;
}

export function loadAuthEnvironment(
  environment: Record<string, string | undefined> = process.env,
): AuthEnvironment {
  const production = environment.NODE_ENV === "production";
  const secret = requiredValue(environment, "BETTER_AUTH_SECRET");

  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new AuthConfigurationError("BETTER_AUTH_SECRET must contain at least 32 bytes.");
  }

  let base: URL;
  try {
    base = new URL(requiredValue(environment, "BETTER_AUTH_URL"));
  } catch {
    throw new AuthConfigurationError("BETTER_AUTH_URL must be a valid origin.");
  }

  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new AuthConfigurationError("BETTER_AUTH_URL must contain only the application origin.");
  }

  if (base.protocol === "http:" && !isLoopback(base.hostname)) {
    throw new AuthConfigurationError("Non-loopback authentication requires HTTPS.");
  }

  if (production && (base.protocol !== "https:" || isLoopback(base.hostname))) {
    throw new AuthConfigurationError("Production authentication requires a public HTTPS origin.");
  }

  let database: URL;
  try {
    database = new URL(requiredValue(environment, "DATABASE_URL"));
  } catch {
    throw new AuthConfigurationError("DATABASE_URL must be a PostgreSQL connection URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname ||
    !database.pathname ||
    database.pathname === "/"
  ) {
    throw new AuthConfigurationError("DATABASE_URL must identify a PostgreSQL host and database.");
  }

  const conflictingTlsOptions = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"];
  if (conflictingTlsOptions.some((option) => database.searchParams.has(option))) {
    throw new AuthConfigurationError(
      "Remove PostgreSQL TLS options from DATABASE_URL; Chron configures verified TLS separately.",
    );
  }

  const databaseTls = production || !isLoopback(database.hostname);
  const proxyValue = environment.AUTH_TRUSTED_PROXY_CIDRS?.trim() ?? "";
  const trustedProxies = proxyValue
    ? proxyValue.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];

  if (trustedProxies.some((entry) => !isValidProxyRange(entry))) {
    throw new AuthConfigurationError(
      "AUTH_TRUSTED_PROXY_CIDRS must contain specific IP addresses or bounded CIDR ranges.",
    );
  }

  if (production && trustedProxies.length === 0) {
    throw new AuthConfigurationError(
      "Production authentication requires the verified reverse-proxy CIDRs.",
    );
  }

  const databaseTlsCA = environment.DATABASE_TLS_CA?.trim();
  if (databaseTlsCA && !databaseTlsCA.includes("-----BEGIN CERTIFICATE-----")) {
    throw new AuthConfigurationError("DATABASE_TLS_CA must contain a PEM certificate.");
  }

  return {
    baseURL: base.origin,
    databaseURL: database.toString(),
    databaseTls,
    ...(databaseTlsCA ? { databaseTlsCA } : {}),
    production,
    secret,
    trustedProxies,
  };
}
