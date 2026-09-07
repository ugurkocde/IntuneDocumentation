import { headers } from "next/headers";
import { getCrispWebsiteId } from "~/lib/crisp-config";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestHeaders = await headers();
  const websiteId = getCrispWebsiteId();
  // Only the public origin can execute the chat SDK. This route never mounts
  // MSAL, receives credentials, or reads app-origin state.
  if (requestHeaders.get("x-site-mode") !== "public" || !websiteId)
    return new Response(null, { status: 404 });
  const nonce = requestHeaders.get("x-nonce") ?? "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Support chat</title>
  <script nonce="${nonce}">try { sessionStorage.clear(); } catch {} window.CRISP_RUNTIME_CONFIG={lock_maximized:true,lock_full_view:true,cross_origin_cookies:true};window.$crisp=[];window.CRISP_WEBSITE_ID=${JSON.stringify(websiteId)};</script>
  <script nonce="${nonce}" src="https://client.crisp.chat/l.js" async></script></head><body style="margin:0;background:white"><p style="font:14px system-ui;padding:16px">Loading support chat...</p></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
