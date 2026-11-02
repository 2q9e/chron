export class StudyRouteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "StudyRouteError";
    this.status = status;
    this.code = code;
  }
}

export function withStudyErrors(operation: () => Promise<Response>): Promise<Response> {
  return operation().catch((error: unknown) => {
    const mapped = error instanceof StudyRouteError
      ? error
      : new StudyRouteError(
          500,
          "STUDY_REQUEST_FAILED",
          "The study request could not be completed.",
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
  });
}
