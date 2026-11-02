import type { LookupFunction } from "node:net";
import { request as httpsRequest } from "node:https";
import { extractWebDocument } from "./html-document.ts";
import { ResearchRouteError } from "./errors.ts";
import {
  parsePublicHttpsSourceURL,
  resolvePublicHttpsTarget,
  type ResolvedAddress,
  type SourceAddressResolver,
} from "./url-policy.ts";

export const maximumSourceURLCharacters = 2048;
export const maximumSourceResponseBytes = 1_048_576;
export const maximumSourceTextCharacters = 40_000;
export const maximumSourceRedirects = 4;
export const maximumSourceReadMilliseconds = 10_000;

const acceptedContentTypes = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);
const acceptedCharsets = new Set([
  "utf-8",
  "utf8",
  "us-ascii",
  "windows-1252",
  "iso-8859-1",
  "utf-16",
  "utf-16le",
  "utf-16be",
]);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

type SourceResponseHeaders = Readonly<Record<string, string | string[] | undefined>>;

export interface SourceHttpResponse {
  readonly statusCode: number;
  readonly headers: SourceResponseHeaders;
  readonly body: AsyncIterable<Uint8Array>;
  destroy?(error?: Error): void;
}

export type PinnedSourceRequester = (
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
) => Promise<SourceHttpResponse>;

export interface SourceReaderDependencies {
  readonly resolveAddresses?: SourceAddressResolver;
  readonly request?: PinnedSourceRequester;
  readonly now?: () => Date;
}

export interface ReadWebSourceResult {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly text: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly redirectCount: number;
  readonly retrievedAt: string;
}

function headerValue(headers: SourceResponseHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return typeof value === "string" ? value.trim() : undefined;
}

function timeoutError(): ResearchRouteError {
  return new ResearchRouteError(
    504,
    "SOURCE_READ_TIMEOUT",
    "The source took too long to respond. Try again later.",
  );
}

function sourceUnavailable(): ResearchRouteError {
  return new ResearchRouteError(
    502,
    "SOURCE_UNAVAILABLE",
    "The HTTPS source could not be read.",
  );
}

async function withAbort<T>(signal: AbortSignal, operation: Promise<T>): Promise<T> {
  if (signal.aborted) throw timeoutError();
  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(timeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function pinnedLookup(hostname: string, address: ResolvedAddress): LookupFunction {
  return (requestedHostname, options, callback) => {
    if (requestedHostname.toLowerCase() !== hostname.toLowerCase()) {
      const error = Object.assign(new Error("The pinned source host changed."), {
        code: "ENOTFOUND",
      }) as NodeJS.ErrnoException;
      callback(error, "", 0);
      return;
    }

    if (typeof options === "object" && options !== null && "all" in options && options.all) {
      callback(null, [{ address: address.address, family: address.family }]);
    } else {
      callback(null, address.address, address.family);
    }
  };
}

function requestPinnedHttps(
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
): Promise<SourceHttpResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        signal,
        lookup: pinnedLookup(url.hostname, address),
        servername: url.hostname,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        maxHeaderSize: 16 * 1024,
        headers: {
          Accept: "text/html, application/xhtml+xml, text/plain;q=0.8",
          "Accept-Encoding": "identity",
          "Connection": "close",
          "User-Agent": "Chron source reader",
        },
      },
      (response) => {
        if (response.statusCode === undefined) {
          response.destroy();
          reject(sourceUnavailable());
          return;
        }
        resolve({
          statusCode: response.statusCode,
          headers: response.headers as SourceResponseHeaders,
          body: response,
          destroy: (error) => response.destroy(error),
        });
      },
    );
    request.once("error", reject);
    request.end();
  });
}

function validateContentType(headers: SourceResponseHeaders): {
  readonly mimeType: string;
  readonly charset: string;
} {
  const raw = headerValue(headers, "content-type");
  if (!raw || raw.length > 255) {
    throw new ResearchRouteError(
      415,
      "UNSUPPORTED_SOURCE_CONTENT",
      "Only HTML and plain text webpages can be read.",
    );
  }

  const [rawMimeType, ...parameters] = raw.split(";");
  const mimeType = rawMimeType.trim().toLowerCase();
  if (!acceptedContentTypes.has(mimeType)) {
    throw new ResearchRouteError(
      415,
      "UNSUPPORTED_SOURCE_CONTENT",
      "Only HTML and plain text webpages can be read.",
    );
  }

  const charsetParameter = parameters.find((parameter) => /^\s*charset\s*=/iu.test(parameter));
  const charset = charsetParameter
    ? charsetParameter.replace(/^\s*charset\s*=\s*/iu, "").replace(/^['"]|['"]$/gu, "").toLowerCase()
    : "utf-8";
  if (!acceptedCharsets.has(charset)) {
    throw new ResearchRouteError(
      415,
      "UNSUPPORTED_SOURCE_CHARSET",
      "This source uses a text encoding Chron cannot read safely.",
    );
  }

  return { mimeType, charset };
}

function validateResponseLength(headers: SourceResponseHeaders): void {
  const contentLength = headerValue(headers, "content-length");
  if (contentLength === undefined) return;
  if (!/^(?:0|[1-9]\d*)$/u.test(contentLength)) {
    throw sourceUnavailable();
  }
  const length = Number(contentLength);
  if (!Number.isSafeInteger(length) || length > maximumSourceResponseBytes) {
    throw new ResearchRouteError(
      413,
      "SOURCE_TOO_LARGE",
      "The source is larger than the 1 MB reading limit.",
    );
  }
}

async function readLimitedBody(
  response: SourceHttpResponse,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for await (const chunk of response.body) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maximumSourceResponseBytes) {
        response.destroy?.();
        throw new ResearchRouteError(
          413,
          "SOURCE_TOO_LARGE",
          "The source is larger than the 1 MB reading limit.",
        );
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof ResearchRouteError) throw error;
    if (signal.aborted) throw timeoutError();
    throw sourceUnavailable();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function decodeText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    throw new ResearchRouteError(
      415,
      "UNSUPPORTED_SOURCE_CHARSET",
      "This source uses a text encoding Chron cannot read safely.",
    );
  }
}

function extractPlainText(source: string): string {
  return source
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, maximumSourceTextCharacters);
}

function sourceRedirectURL(location: string, currentURL: URL): URL {
  if (location.length === 0 || location.length > maximumSourceURLCharacters) {
    throw new ResearchRouteError(
      502,
      "SOURCE_REDIRECT_BLOCKED",
      "The source redirected to an address Chron cannot read.",
    );
  }

  try {
    return parsePublicHttpsSourceURL(new URL(location, currentURL));
  } catch (error) {
    if (error instanceof ResearchRouteError) {
      throw new ResearchRouteError(
        502,
        "SOURCE_REDIRECT_BLOCKED",
        "The source redirected to an address Chron cannot read.",
      );
    }
    throw sourceUnavailable();
  }
}

export async function readPublicWebSource(
  input: unknown,
  dependencies: SourceReaderDependencies = {},
): Promise<ReadWebSourceResult> {
  if (typeof input !== "string" || input.length > maximumSourceURLCharacters || !input.trim()) {
    throw new ResearchRouteError(
      400,
      "INVALID_SOURCE_URL",
      "Enter an HTTPS webpage address up to 2048 characters long.",
    );
  }

  const requestedURL = parsePublicHttpsSourceURL(input.trim());
  let currentURL = requestedURL;
  const signal = AbortSignal.timeout(maximumSourceReadMilliseconds);
  const resolver = dependencies.resolveAddresses;
  const request = dependencies.request ?? requestPinnedHttps;
  let redirectCount = 0;

  while (true) {
    if (signal.aborted) throw timeoutError();

    const addresses = await withAbort(
      signal,
      resolvePublicHttpsTarget(currentURL.hostname, resolver),
    );
    let response: SourceHttpResponse;
    try {
      response = await withAbort(signal, request(currentURL, addresses[0], signal));
    } catch {
      if (signal.aborted) throw timeoutError();
      throw sourceUnavailable();
    }

    if (redirectStatuses.has(response.statusCode)) {
      const location = headerValue(response.headers, "location");
      response.destroy?.();
      if (redirectCount >= maximumSourceRedirects) {
        throw new ResearchRouteError(
          502,
          "SOURCE_REDIRECT_LIMIT",
          "The source redirected too many times.",
        );
      }
      if (location === undefined) throw sourceUnavailable();
      currentURL = sourceRedirectURL(location, currentURL);
      redirectCount += 1;
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy?.();
      throw sourceUnavailable();
    }

    const contentEncoding = headerValue(response.headers, "content-encoding");
    if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
      response.destroy?.();
      throw new ResearchRouteError(
        415,
        "UNSUPPORTED_SOURCE_ENCODING",
        "The source uses a response encoding Chron cannot read safely.",
      );
    }

    let content: ReturnType<typeof validateContentType>;
    try {
      content = validateContentType(response.headers);
      validateResponseLength(response.headers);
    } catch (error) {
      response.destroy?.();
      throw error;
    }
    const { mimeType, charset } = content;
    const bytes = await readLimitedBody(response, signal);
    const decoded = decodeText(bytes, charset);
    const document = mimeType === "text/plain"
      ? { title: "", text: extractPlainText(decoded) }
      : extractWebDocument(decoded, maximumSourceTextCharacters);

    if (!document.text) {
      throw new ResearchRouteError(
        422,
        "SOURCE_HAS_NO_READABLE_TEXT",
        "The page did not contain readable text.",
      );
    }

    return {
      requestedUrl: requestedURL.href,
      finalUrl: currentURL.href,
      title: document.title,
      text: document.text,
      contentType: mimeType,
      byteLength: bytes.byteLength,
      redirectCount,
      retrievedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    };
  }
}
