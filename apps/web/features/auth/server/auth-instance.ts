import "server-only";
import { betterAuth } from "better-auth";
import { sendAuthEmail } from "./email.ts";
import { database } from "./database-pool.ts";
import { loadAuthEnvironment } from "./environment.ts";

const environment = loadAuthEnvironment();

export { database };

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
