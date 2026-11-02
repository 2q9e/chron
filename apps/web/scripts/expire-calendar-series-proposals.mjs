import { pathToFileURL } from "node:url";
import { runSeriesExpiryWorker } from "../features/calendar/server/series-expiry-worker.ts";

async function main() {
  const { database } = await import("../features/auth/server/database-pool.ts");
  try {
    const { CalendarRepository } = await import("../features/calendar/server/repository.ts");
    const repository = new CalendarRepository(database);
    const summary = await runSeriesExpiryWorker(database, repository);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (summary.failedOwners > 0) process.exitCode = 1;
  } finally {
    await database.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Calendar proposal expiry run failed; the next scheduled run will retry.\n");
    process.exitCode = 1;
  });
}
