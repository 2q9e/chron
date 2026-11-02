import { createResearchReadEndpoint } from "../../../../../features/research/server/endpoint.ts";
import { ResearchRateLimitRepository } from "../../../../../features/research/server/rate-limit-repository.ts";
import { readPublicWebSource } from "../../../../../features/research/server/web-source-reader.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const readEndpoint = createResearchReadEndpoint({
    baseURL: process.env.BETTER_AUTH_URL,
    authenticate: async (incomingRequest) => {
      const { auth } = await import("../../../../../features/auth/server/auth-instance.ts");
      const session = await auth.api.getSession({ headers: incomingRequest.headers });
      return session?.user?.id ?? null;
    },
    consumeReadLimit: async (userId) => {
      const { database } = await import("../../../../../features/auth/server/auth-instance.ts");
      return new ResearchRateLimitRepository(database).consume(userId);
    },
    readSource: readPublicWebSource,
  });
  return readEndpoint(request);
}
