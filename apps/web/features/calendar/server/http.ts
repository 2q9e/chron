import { CalendarRouteError } from "./errors.ts";

export const maximumCalendarJsonBytes = 24 * 1024;

export function calendarJson(
  data: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(data, { ...init, headers });
}

export function calendarEmpty(init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(null, { ...init, headers });
}

export function requireSameOriginMutation(
  request: Request,
  configuredBaseUrl: string | undefined,
): void {
  const origin = request.headers.get("origin");
  let trustedOrigin: string;

  try {
    if (!configuredBaseUrl) throw new Error("Missing origin configuration");
    trustedOrigin = new URL(configuredBaseUrl).origin;
  } catch {
    throw new CalendarRouteError(
      503,
      "CALENDAR_CONFIGURATION_UNAVAILABLE",
      "Calendar security settings are unavailable.",
    );
  }

  if (!origin || origin === "null" || origin !== trustedOrigin) {
    throw new CalendarRouteError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "This calendar change must come from the signed-in site.",
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new CalendarRouteError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "This calendar change must come from the signed-in site.",
    );
  }
}

export async function readCalendarJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new CalendarRouteError(415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON request body.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new CalendarRouteError(400, "INVALID_CONTENT_LENGTH", "The request size is invalid.");
    }
    if (Number(contentLength) > maximumCalendarJsonBytes) {
      throw new CalendarRouteError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
    }
  }

  if (!request.body) {
    throw new CalendarRouteError(400, "INVALID_JSON", "Send a valid JSON request body.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumCalendarJsonBytes) {
        await reader.cancel();
        throw new CalendarRouteError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new CalendarRouteError(400, "INVALID_JSON", "Send a valid JSON request body.");
  }
}

export function exactQueryValues(
  url: URL,
  keys: readonly string[],
): Readonly<Record<string, string>> {
  const allowed = new Set(keys);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new CalendarRouteError(400, "INVALID_QUERY", "The calendar query contains an unsupported field.");
    }
  }

  const values: Record<string, string> = {};
  for (const key of keys) {
    const matches = url.searchParams.getAll(key);
    if (matches.length !== 1 || matches[0] === "") {
      throw new CalendarRouteError(400, "INVALID_QUERY", "Provide each calendar range field exactly once.");
    }
    values[key] = matches[0];
  }
  return values;
}

export function parseRevisionPrecondition(value: string | null): number {
  if (value === null) {
    throw new CalendarRouteError(428, "PRECONDITION_REQUIRED", "Reload the event before saving changes.");
  }

  const match = /^"([1-9]\d*)"$/.exec(value.trim());
  if (!match) {
    throw new CalendarRouteError(400, "INVALID_PRECONDITION", "The event revision is invalid.");
  }

  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision)) {
    throw new CalendarRouteError(400, "INVALID_PRECONDITION", "The event revision is invalid.");
  }
  return revision;
}

export function eventEtag(revision: number): string {
  return `"${revision}"`;
}
