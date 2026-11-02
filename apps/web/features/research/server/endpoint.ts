import { ResearchRouteError, withResearchErrors } from "./errors.ts";
import {
  parseResearchSourceRequest,
  readResearchJSON,
  researchJson,
  requireResearchSameOrigin,
} from "./http.ts";
import type { ReadWebSourceResult } from "./web-source-reader.ts";

export interface ResearchEndpointDependencies {
  readonly baseURL: string | undefined;
  readonly authenticate: (request: Request) => Promise<string | null>;
  readonly consumeReadLimit: (userId: string) => Promise<boolean>;
  readonly readSource: (url: string) => Promise<ReadWebSourceResult>;
}

export function createResearchReadEndpoint(
  dependencies: ResearchEndpointDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => withResearchErrors(async () => {
    requireResearchSameOrigin(request, dependencies.baseURL);

    let userId: string | null;
    try {
      userId = await dependencies.authenticate(request);
    } catch {
      throw new ResearchRouteError(
        503,
        "AUTHENTICATION_UNAVAILABLE",
        "Sign-in could not be verified right now.",
      );
    }

    if (typeof userId !== "string" || userId.length < 1 || userId.length > 255 || userId.includes("\u0000")) {
      throw new ResearchRouteError(401, "AUTHENTICATION_REQUIRED", "Sign in to read a source.");
    }

    const url = parseResearchSourceRequest(await readResearchJSON(request));
    let allowed: boolean;
    try {
      allowed = await dependencies.consumeReadLimit(userId);
    } catch {
      throw new ResearchRouteError(
        503,
        "RESEARCH_STORAGE_UNAVAILABLE",
        "Research is temporarily unavailable. Try again later.",
      );
    }

    if (!allowed) {
      throw new ResearchRouteError(
        429,
        "SOURCE_READ_RATE_LIMITED",
        "You have reached the limit of five source reads per minute. Try again shortly.",
      );
    }

    return researchJson({ source: await dependencies.readSource(url) });
  });
}
