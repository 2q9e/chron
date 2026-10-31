export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AuthMethod = "GET" | "POST";

async function dispatch(request: Request, method: AuthMethod): Promise<Response> {
  try {
    const [{ auth }, { toNextJsHandler }] = await Promise.all([
      import("@/features/auth/server/auth-instance"),
      import("better-auth/next-js"),
    ]);
    const handlers = toNextJsHandler(auth);
    const response = await handlers[method](request);
    const headers = new Headers(response.headers);
    const originalCookies = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const cookies = originalCookies.getSetCookie?.() ?? [];

    if (cookies.length > 0) {
      headers.delete("set-cookie");
      for (const cookie of cookies) headers.append("set-cookie", cookie);
    }

    headers.set("cache-control", "private, no-store");
    headers.set("pragma", "no-cache");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return Response.json(
      { error: "Authentication is temporarily unavailable." },
      {
        status: 503,
        headers: {
          "cache-control": "private, no-store",
          pragma: "no-cache",
        },
      },
    );
  }
}

export function GET(request: Request): Promise<Response> {
  return dispatch(request, "GET");
}

export function POST(request: Request): Promise<Response> {
  return dispatch(request, "POST");
}
