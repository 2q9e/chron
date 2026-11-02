import type { Pool } from "pg";

const maximumReadsPerWindow = 5;
const windowMilliseconds = 60_000;

export class ResearchRateLimitRepository {
  private readonly database: Pool;

  constructor(database: Pool) {
    this.database = database;
  }

  async consume(userId: string, now = new Date()): Promise<boolean> {
    const client = await this.database.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query("SELECT set_config('chron.user_id', $1, true)", [userId]);
      const result = await client.query<{ request_count: number }>(
        `INSERT INTO research_web_rate_limits AS quota (
           user_id, window_started_at, request_count
         ) VALUES ($1, $2, 1)
         ON CONFLICT (user_id) DO UPDATE SET
           window_started_at = CASE
             WHEN quota.window_started_at <= $2::timestamptz - interval '60 seconds'
               THEN $2::timestamptz
             ELSE quota.window_started_at
           END,
           request_count = CASE
             WHEN quota.window_started_at <= $2::timestamptz - interval '60 seconds'
               THEN 1
             ELSE quota.request_count + 1
           END
         WHERE quota.window_started_at <= $2::timestamptz - interval '60 seconds'
            OR quota.request_count < $3
         RETURNING request_count`,
        [userId, now, maximumReadsPerWindow],
      );
      await client.query("COMMIT");
      transactionStarted = false;
      return result.rows.length === 1;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original database error.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const researchRateLimitWindowMilliseconds = windowMilliseconds;
export const researchRateLimitMaximumReads = maximumReadsPerWindow;
