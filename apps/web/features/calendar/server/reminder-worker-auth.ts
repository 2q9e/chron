import { timingSafeEqual } from "node:crypto";

const minimumTokenLength = 32;

export function isAuthorizedReminderWorkerRequest(
  request: Pick<Request, "headers">,
  expectedToken = process.env.CALENDAR_REMINDER_WORKER_TOKEN,
): boolean {
  if (!expectedToken || Buffer.byteLength(expectedToken, "utf8") < minimumTokenLength) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const suppliedToken = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(expectedToken, "utf8");
  const suppliedBytes = Buffer.from(suppliedToken, "utf8");
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}
