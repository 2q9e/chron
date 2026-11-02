import { ResearchRouteError } from "./errors.ts";

export const maximumResearchRequestBytes = 8 * 1024;

export function researchJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(data, { ...init, headers });
}

export function requireResearchSameOrigin(
  request: Request,
  configuredBaseURL: string | undefined,
): void {
  let expectedOrigin: string;
  try {
    if (!configuredBaseURL) throw new Error("Missing application origin.");
    const configured = new URL(configuredBaseURL);
    if (
      configured.protocol !== "https:" &&
      !(configured.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname))
    ) {
      throw new Error("The application origin must use HTTPS.");
    }
    expectedOrigin = configured.origin;
  } catch {
    throw new ResearchRouteError(
      503,
      "RESEARCH_CONFIGURATION_UNAVAILABLE",
      "Research security settings are unavailable right now.",
    );
  }

  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || origin !== expectedOrigin) {
    throw new ResearchRouteError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "This source request must come from the signed-in Chron site.",
    );
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ResearchRouteError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "This source request must come from the signed-in Chron site.",
    );
  }
}

export async function readResearchJSON(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new ResearchRouteError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send a JSON request body.",
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      throw new ResearchRouteError(400, "INVALID_CONTENT_LENGTH", "The request size is invalid.");
    }
    if (Number(contentLength) > maximumResearchRequestBytes) {
      throw new ResearchRouteError(413, "REQUEST_TOO_LARGE", "The request body is too large.");
    }
  }

  if (!request.body) {
    throw new ResearchRouteError(400, "INVALID_JSON", "Send a valid JSON request body.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumResearchRequestBytes) {
        await reader.cancel();
        throw new ResearchRouteError(413, "REQUEST_TOO_LARGE", "The request body is too large.");
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
    throw new ResearchRouteError(400, "INVALID_JSON", "Send a valid JSON request body.");
  }
}

export function parseResearchSourceRequest(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("url" in value) ||
    typeof value.url !== "string"
  ) {
    throw new ResearchRouteError(
      400,
      "INVALID_SOURCE_REQUEST",
      "Provide one HTTPS webpage address.",
    );
  }
  return value.url;
}
