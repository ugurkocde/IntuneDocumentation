export function getCrispWebsiteId() {
  const value =
    process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID ??
    (process.env.VERCEL_ENV === "production"
      ? "d8cf4fcb-0dbe-42ee-b94c-3bbc415d58f4"
      : undefined);
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
}
