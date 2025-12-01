/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// Minimal BullMQ queue setup placeholder for retention, exports, and notifications.
// This file is not imported by Next.js runtime; run separately with `ts-node worker/queues.ts`.
// Set REDIS_URL before running. Install bullmq if you plan to activate queues.

// NOTE: This is a stub to show how queues would be wired. Real cleanup/export logic
// should live in dedicated processors and use signed S3 deletes + DB updates.

async function main() {
  let BullMQ;
  try {
    BullMQ = require("bullmq");
  } catch (err) {
    console.warn("bullmq is not installed. Install with `npm i bullmq` to enable worker queues.");
    return;
  }

  const { Queue, Worker } = BullMQ;
  const connection = { connection: { url: process.env.REDIS_URL } };

  const retentionQueue = new Queue("screenshot-retention", connection);
  const exportQueue = new Queue("exports", connection);
  const notificationQueue = new Queue("notifications", connection);

  new Worker(
    "screenshot-retention",
    async (job: any) => {
      console.log("Run retention cleanup for org", job.data.orgId);
      // TODO: delete screenshot metadata/objects older than retentionDays.
    },
    connection,
  );

  new Worker(
    "exports",
    async (job: any) => {
      console.log("Generate export", job.data);
      // TODO: trigger export generation and store in S3 or return via callback.
    },
    connection,
  );

  new Worker(
    "notifications",
    async (job: any) => {
      console.log("Dispatch notification", job.data);
      // TODO: send in-app/email notifications.
    },
    connection,
  );

  console.log("Queues ready. Enqueue jobs using the exported queues.");
}

main();
