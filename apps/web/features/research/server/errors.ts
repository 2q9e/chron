export class ResearchRouteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ResearchRouteError";
    this.status = status;
    this.code = code;
  }
}

export function researchErrorResponse(error: unknown): Response {
  const mapped = error instanceof ResearchRouteError
    ? error
    : new ResearchRouteError(
      500,
      "RESEARCH_REQUEST_FAILED",
      "The source could not be read right now.",
    );

  return Response.json(
    { error: { code: mapped.code, message: mapped.message } },
    {
      status: mapped.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function withResearchErrors(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return researchErrorResponse(error);
  }
}
