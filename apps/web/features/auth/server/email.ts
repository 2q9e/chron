import { Temporal } from "@js-temporal/polyfill";
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

export type CalendarReminderEmailInput = Readonly<{
  recipient: string;
  eventKind: "timed" | "all-day";
  eventStart: string;
  timeZone: string;
}>;

export type CalendarReminderEmailContent = Readonly<{
  subject: string;
  text: string;
}>;

export class CalendarReminderDeliveryError extends Error {
  readonly code: "INVALID_RECIPIENT" | "INVALID_SCHEDULE" | "SMTP_CONFIGURATION" | "SMTP_REJECTED" | "SMTP_TRANSIENT";
  readonly retryable: boolean;

  constructor(
    code: "INVALID_RECIPIENT" | "INVALID_SCHEDULE" | "SMTP_CONFIGURATION" | "SMTP_REJECTED" | "SMTP_TRANSIENT",
    retryable: boolean,
  ) {
    super("Chron could not deliver a calendar reminder.");
    this.name = "CalendarReminderDeliveryError";
    this.code = code;
    this.retryable = retryable;
  }
}

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

function applicationCalendarURL(): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (!configured) throw new AuthConfigurationError("Missing application origin for calendar email links.");

  let origin: URL;
  try {
    origin = new URL(configured);
  } catch {
    throw new AuthConfigurationError("The application origin for calendar email links is invalid.");
  }

  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if ((origin.protocol !== "https:" && !(loopback && origin.protocol === "http:"))
    || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new AuthConfigurationError("Public calendar email links require an HTTPS application origin.");
  }

  return new URL("/calendar", origin).href;
}

export function buildCalendarReminderEmail(
  message: Omit<CalendarReminderEmailInput, "recipient">,
): CalendarReminderEmailContent {
  const timeZone = message.timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new CalendarReminderDeliveryError("INVALID_SCHEDULE", false);
  }

  let eventTime: string;
  if (message.eventKind === "timed") {
    const instant = new Date(message.eventStart);
    if (!Number.isFinite(instant.valueOf())) {
      throw new CalendarReminderDeliveryError("INVALID_SCHEDULE", false);
    }
    eventTime = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    }).format(instant);
  } else {
    try {
      const date = Temporal.PlainDate.from(message.eventStart, { overflow: "reject" });
      if (date.toString() !== message.eventStart) throw new RangeError("Invalid date");
      eventTime = `all day on ${date.toLocaleString("en-US", { dateStyle: "full" })}`;
    } catch {
      throw new CalendarReminderDeliveryError("INVALID_SCHEDULE", false);
    }
  }

  return {
    subject: "Your Chron calendar reminder",
    text: `A calendar event is scheduled for ${eventTime} (${timeZone}).\n\nOpen your Chron calendar: ${applicationCalendarURL()}`,
  };
}

async function sendTextEmail(recipient: string, subject: string, text: string): Promise<void> {
  const configuration = getSmtpConfiguration();
  const transport = createTransport(configuration);

  try {
    await transport.sendMail({
      from: configuration.sender,
      to: recipient,
      subject,
      text,
    });
  } finally {
    transport.close();
  }
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
  await sendTextEmail(
    message.recipient,
    message.subject,
    `${message.instructions}\n\n${action.href}\n\nIf you did not request this, you can ignore this email.`,
  );
}

export async function sendCalendarReminderEmail(
  message: CalendarReminderEmailInput,
): Promise<void> {
  if (message.recipient.length > 320 || /[\r\n\u0000]/u.test(message.recipient)
    || !message.recipient.includes("@")) {
    throw new CalendarReminderDeliveryError("INVALID_RECIPIENT", false);
  }

  try {
    const content = buildCalendarReminderEmail(message);
    await sendTextEmail(message.recipient, content.subject, content.text);
  } catch (error) {
    if (error instanceof CalendarReminderDeliveryError) throw error;
    if (error instanceof AuthConfigurationError) {
      throw new CalendarReminderDeliveryError("SMTP_CONFIGURATION", false);
    }
    const responseCode = error && typeof error === "object" && "responseCode" in error
      ? (error as { responseCode?: unknown }).responseCode
      : undefined;
    if (typeof responseCode === "number" && responseCode >= 500) {
      throw new CalendarReminderDeliveryError("SMTP_REJECTED", false);
    }
    throw new CalendarReminderDeliveryError("SMTP_TRANSIENT", true);
  }
}
