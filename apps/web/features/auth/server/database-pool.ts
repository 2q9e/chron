import { Pool } from "pg";
import { loadAuthEnvironment } from "./environment.ts";

type AuthGlobal = typeof globalThis & {
  __chronAuthPool?: Pool;
};

const environment = loadAuthEnvironment();
const authGlobal = globalThis as AuthGlobal;

export const database = authGlobal.__chronAuthPool ?? new Pool({
  connectionString: environment.databaseURL,
  ...(environment.databaseTls
    ? {
        ssl: {
          rejectUnauthorized: true,
          ...(environment.databaseTlsCA ? { ca: environment.databaseTlsCA } : {}),
          ...(environment.databaseTlsServername
            ? { servername: environment.databaseTlsServername }
            : {}),
        },
      }
    : {}),
  application_name: "chron-auth",
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  max: 5,
});

authGlobal.__chronAuthPool = database;
database.on("error", () => {
  process.emitWarning("An idle Chron authentication database connection was reset.", {
    code: "CHRON_AUTH_DATABASE_POOL_ERROR",
  });
});
