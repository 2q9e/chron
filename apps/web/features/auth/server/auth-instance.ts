import "server-only";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { sendAuthEmail } from "./email.ts";
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

export const auth = betterAuth({
  appName: "Chron",
  baseURL: environment.baseURL,
  secret: environment.secret,
  database,
  telemetry: { enabled: false },
  trustedOrigins: [environment.baseURL],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url, token }) => {
      await sendAuthEmail({
        recipient: user.email,
        subject: "Reset your Chron password",
        actionURL: url,
        expectedOrigin: environment.baseURL,
        expectedPath: "/api/auth/reset-password",
        token,
        tokenLocation: "path",
        instructions: "A password reset was requested for your Chron account.",
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendAuthEmail({
        recipient: user.email,
        subject: "Verify your Chron email address",
        actionURL: url,
        expectedOrigin: environment.baseURL,
        expectedPath: "/api/auth/verify-email",
        token,
        tokenLocation: "query",
        instructions: "Verify the email address associated with your Chron account.",
      });
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 12,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/verify-email": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: environment.production,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    ipAddress: {
      trustedProxies: environment.trustedProxies,
    },
    defaultCookieAttributes: {
      httpOnly: true,
      secure: environment.production,
      sameSite: "lax",
      path: "/",
    },
  },
});
