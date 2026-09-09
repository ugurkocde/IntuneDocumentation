// Run beside the web application on EU infrastructure. No browser or auth bypass.
const origin = process.env.ENTERPRISE_APP_ORIGIN ?? process.env.APP_SITE_ORIGIN;
const secret = process.env.CRON_SECRET;
if (!origin || !secret || secret.length < 32)
  throw new Error(
    "Set APP_SITE_ORIGIN and a CRON_SECRET of at least 32 characters.",
  );
const url = new URL("/api/enterprise/worker", origin);
if (
  url.protocol !== "https:" &&
  url.hostname !== "localhost" &&
  url.hostname !== "127.0.0.1"
)
  throw new Error("Worker origin must use HTTPS.");
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const concurrency = Math.max(
  1,
  Math.min(8, Number(process.env.ENTERPRISE_WORKER_CONCURRENCY ?? 2)),
);
async function loop() {
  while (!stopping) {
    let delay = 10000;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(300000),
      });
      if (!response.ok)
        console.error(`Worker endpoint returned HTTP ${response.status}`);
      else {
        const result = await response.json();
        if (result.processed) delay = 250;
        if (result.paused) delay = 60000;
      }
    } catch {
      console.error("Worker endpoint request failed. Retrying.");
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
await Promise.all(Array.from({ length: concurrency }, loop));
