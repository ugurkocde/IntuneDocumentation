import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
export function publicAddress(address: string) {
  if (isIP(address) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(address) &&
      !address.toLowerCase().startsWith("2001:db8:")
    );
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a !== 169 &&
    a !== 192 &&
    !(a === 172 && b! >= 16 && b! <= 31) &&
    !(a === 100 && b! >= 64 && b! <= 127) &&
    a! < 224 &&
    a !== 198 &&
    a !== 203
  );
}
export async function deliverWebhook(
  target: string,
  secret: string,
  event: Record<string, unknown>,
  id: string,
) {
  const url = new URL(target);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Webhook destination must be public HTTPS");
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((item) => !publicAddress(item.address))
  )
    throw new Error("Webhook destination resolves to a restricted address");
  const address = addresses[0]!;
  const timestamp = Math.floor(Date.now() / 1000).toString(),
    body = JSON.stringify(event);
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("hex");
  await new Promise<void>((resolve, reject) => {
    // Pin the validated DNS result; never follow redirects or resolve again.
    const req = request(
      url,
      {
        method: "POST",
        timeout: 15000,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "Webhook-Id": id,
          "Webhook-Timestamp": timestamp,
          "Webhook-Signature": `v1=${signature}`,
        },
      },
      (response) => {
        response.resume();
        if (
          response.statusCode &&
          response.statusCode >= 200 &&
          response.statusCode < 300
        )
          resolve();
        else
          reject(
            new Error(`Webhook returned HTTP ${response.statusCode ?? 0}`),
          );
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("Webhook delivery timed out")),
    );
    req.on("error", reject);
    req.end(body);
  });
}
export function nextSchedule(
  after: Date,
  cadence: string,
  hour: number,
  timezone: string,
) {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
  // Search UTC quarter-hours for current IANA offsets, including half-hour zones.
  // Suppress a second run in the repeated local hour at the autumn transition.
  const localAfter = Object.fromEntries(
    format.formatToParts(after).map((p) => [p.type, p.value]),
  );
  const start = Math.floor(after.getTime() / 900000) * 900000 + 900000;
  for (let i = 0; i < 24 * 4 * 100; i++) {
    const candidate = new Date(start + i * 900000),
      parts = Object.fromEntries(
        format.formatToParts(candidate).map((p) => [p.type, p.value]),
      );
    if (Number(parts.hour) !== hour || parts.minute !== "00") continue;
    if (
      parts.month === localAfter.month &&
      parts.day === localAfter.day &&
      parts.hour === localAfter.hour
    )
      continue;
    if (cadence === "weekly" && parts.weekday !== "Mon") continue;
    if (
      (cadence === "monthly" || cadence === "quarterly") &&
      parts.day !== "01"
    )
      continue;
    if (
      cadence === "quarterly" &&
      !["01", "04", "07", "10"].includes(parts.month ?? "")
    )
      continue;
    return candidate;
  }
  throw new Error("Could not calculate next scheduled run");
}
