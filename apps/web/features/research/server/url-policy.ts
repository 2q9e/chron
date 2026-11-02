import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { ResearchRouteError } from "./errors.ts";

export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

export type SourceAddressResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

const localHostSuffixes = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".test",
  ".example",
  ".invalid",
] as const;

const hostnameLabel = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u;

function invalidSourceURL(): ResearchRouteError {
  return new ResearchRouteError(
    400,
    "INVALID_SOURCE_URL",
    "Enter a public HTTPS webpage address without credentials or a custom port.",
  );
}

export function parsePublicHttpsSourceURL(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input instanceof URL ? input.href : input);
  } catch {
    throw invalidSourceURL();
  }

  const authority = /^https:\/\/([^/?#]*)/iu.exec(url.href)?.[1] ?? "";

  if (url.protocol !== "https:") {
    throw new ResearchRouteError(
      400,
      "HTTPS_REQUIRED",
      "Only HTTPS webpages can be read.",
    );
  }

  if (authority.includes("@") || url.username || url.password || (url.port && url.port !== "443")) {
    throw invalidSourceURL();
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  const ipHost = hostname.replace(/^\[|\]$/gu, "");
  if (
    !hostname.includes(".") ||
    hostname.length > 253 ||
    isIP(ipHost) !== 0 ||
    hostname === "localhost" ||
    localHostSuffixes.some((suffix) => hostname.endsWith(suffix)) ||
    !hostname.split(".").every((label) => hostnameLabel.test(label))
  ) {
    throw new ResearchRouteError(
      400,
      "PUBLIC_HOST_REQUIRED",
      "Enter a public domain name. IP addresses and local network names are not allowed.",
    );
  }

  url.hostname = hostname;
  url.port = "";
  url.hash = "";
  return url;
}

export function isPublicUnicastAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if ("isIPv4MappedAddress" in parsed && parsed.isIPv4MappedAddress()) return false;
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

const systemResolver: SourceAddressResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({
    address,
    family,
  }));

export async function resolvePublicHttpsTarget(
  hostname: string,
  resolver: SourceAddressResolver = systemResolver,
): Promise<readonly ResolvedAddress[]> {
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new ResearchRouteError(
      502,
      "SOURCE_DNS_UNAVAILABLE",
      "The source domain could not be resolved.",
    );
  }

  if (
    addresses.length === 0 ||
    addresses.length > 32 ||
    addresses.some(({ address, family }) =>
      (family !== 4 && family !== 6) || isIP(address) !== family || !isPublicUnicastAddress(address)
    )
  ) {
    throw new ResearchRouteError(
      403,
      "SOURCE_DESTINATION_BLOCKED",
      "The source resolves to a restricted network address and cannot be read.",
    );
  }

  return addresses;
}
