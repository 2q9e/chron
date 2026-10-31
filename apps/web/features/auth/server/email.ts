import nodemailer from "nodemailer";
import { AuthConfigurationError } from "./environment.ts";

type AuthEmail = Readonly<{
  recipient: string;
  subject: string;
  actionURL: string;
  expectedOrigin: string;
  expectedPath: string;
  token: string;
  tokenLocation: "path" | "query";
  instructions: string;
}>;

type SmtpConfiguration = Readonly<{
  host: string;
  port: number;
  mode: "implicit" | "starttls";
  username: string;
  password: string;
  sender: string;
}>;

function requireSmtpValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AuthConfigurationError(`Missing required mail-delivery setting: ${name}`);
  }
  return value;
}

function getSmtpConfiguration(): SmtpConfiguration {
  const host = requireSmtpValue("SMTP_HOST");
  const portText = requireSmtpValue("SMTP_PORT");
  const mode = requireSmtpValue("SMTP_TLS_MODE");
  const sender = requireSmtpValue("SMTP_FROM");
  const username = requireSmtpValue("SMTP_USER");
  const password = requireSmtpValue("SMTP_PASSWORD");
  const port = Number(portText);

  if (!/^[a-z0-9.-]+$/i.test(host) || host.startsWith(".") || host.endsWith(".")) {
    throw new AuthConfigurationError("SMTP_HOST must be a DNS hostname.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AuthConfigurationError("SMTP_PORT must be a valid TCP port.");
  }

  if (mode !== "implicit" && mode !== "starttls") {
    throw new AuthConfigurationError("SMTP_TLS_MODE must use implicit TLS or STARTTLS.");
  }

  if ((mode === "implicit" && port !== 465) || (mode === "starttls" && port === 465)) {
    throw new AuthConfigurationError("SMTP_PORT does not match SMTP_TLS_MODE.");
  }

  if (!sender || /[\r\n]/.test(sender)) {
    throw new AuthConfigurationError("SMTP_FROM must be a single valid sender address.");
  }

  return { host, port, mode, sender, username, password };
}

function createTransport(configuration: SmtpConfiguration) {
  return nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.mode === "implicit",
    requireTLS: configuration.mode === "starttls",
    auth: { user: configuration.username, pass: configuration.password },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}

export function isValidAuthActionURL(message: Pick<
  AuthEmail,
  "actionURL" | "expectedOrigin" | "expectedPath" | "token" | "tokenLocation"
>): boolean {
  let action: URL;
  try {
    action = new URL(message.actionURL);
  } catch {
    return false;
  }

  const pathMatches = message.tokenLocation === "path"
    ? action.pathname === `${message.expectedPath}/${encodeURIComponent(message.token)}`
    : action.pathname === message.expectedPath;
  const tokenMatches = message.tokenLocation === "path"
    ? true
    : action.searchParams.get("token") === message.token;

  return action.origin === message.expectedOrigin && pathMatches && tokenMatches && !action.hash;
}

export async function sendAuthEmail(message: AuthEmail): Promise<void> {
  if (!isValidAuthActionURL(message)) {
    throw new AuthConfigurationError("The authentication link did not match Chron's expected route.");
  }

  const action = new URL(message.actionURL);
  const configuration = getSmtpConfiguration();
  const transport = createTransport(configuration);

  try {
    await transport.sendMail({
      from: configuration.sender,
      to: message.recipient,
      subject: message.subject,
      text: `${message.instructions}\n\n${action.href}\n\nIf you did not request this, you can ignore this email.`,
    });
  } finally {
    transport.close();
  }
}
