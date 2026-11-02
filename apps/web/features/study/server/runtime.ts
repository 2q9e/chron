import "server-only";
import { StudyRouteError } from "./errors.ts";
import { StudyRepository } from "./repository.ts";

type StudyServices = Readonly<{
  auth: typeof import("../../auth/server/auth-instance.ts").auth;
  repository: StudyRepository;
}>;

let servicesPromise: Promise<StudyServices> | undefined;

async function getStudyServices(): Promise<StudyServices> {
  servicesPromise ??= import("../../auth/server/auth-instance.ts")
    .then(({ auth, database }) => ({ auth, repository: new StudyRepository(database) }))
    .catch(() => {
      servicesPromise = undefined;
      throw new StudyRouteError(
        503,
        "STUDY_CONFIGURATION_UNAVAILABLE",
        "Study account storage is not available right now.",
      );
    });
  return servicesPromise;
}

export async function getStudyRepository(): Promise<StudyRepository> {
  return (await getStudyServices()).repository;
}

export async function requireStudyUser(request: Request): Promise<string> {
  const { auth } = await getStudyServices();
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {
    throw new StudyRouteError(
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Sign-in could not be verified right now.",
    );
  }

  const userId = session?.user?.id;
  if (
    typeof userId !== "string" || userId.length < 1 || userId.length > 255 || userId.includes("\u0000")
  ) {
    throw new StudyRouteError(401, "AUTHENTICATION_REQUIRED", "Sign in to use your study workspace.");
  }
  return userId;
}
