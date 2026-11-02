import { StudyRouteError } from "./errors.ts";

const maximumStudyJsonBytes = 64 * 1024;

export function studyJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(data, { ...init, headers });
}

export function requireStudySameOriginMutation(
  request: Request,
  configuredBaseUrl: string | undefined,
): void {
  const origin = request.headers.get("origin");
  let trustedOrigin: string;

  try {
    if (!configuredBaseUrl) throw new Error("Missing origin configuration");
    const configuredUrl = new URL(configuredBaseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(configuredUrl.hostname);
    if (configuredUrl.protocol !== "https:" && !loopback) throw new Error("Public origins require TLS");
    trustedOrigin = configuredUrl.origin;
  } catch {
    throw new StudyRouteError(
      503,
      "STUDY_CONFIGURATION_UNAVAILABLE",
      "Study security settings are unavailable.",
    );
  }

  if (!origin || origin === "null" || origin !== trustedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new StudyRouteError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "This study change must come from the signed-in site.",
    );
  }
}

export async function readStudyJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new StudyRouteError(415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON request body.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      throw new StudyRouteError(400, "INVALID_CONTENT_LENGTH", "The request size is invalid.");
    }
    if (Number(contentLength) > maximumStudyJsonBytes) {
      throw new StudyRouteError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
    }
  }

  if (!request.body) {
    throw new StudyRouteError(400, "INVALID_JSON", "Send a valid JSON request body.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumStudyJsonBytes) {
        await reader.cancel();
        throw new StudyRouteError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
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
    throw new StudyRouteError(400, "INVALID_JSON", "Send a valid JSON request body.");
  }
}

export function parseStudyRouteId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new StudyRouteError(404, "STUDY_ITEM_NOT_FOUND", "That study item could not be found.");
  }
  return value.toLowerCase();
}
