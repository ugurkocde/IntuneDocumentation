// Shared by the server-rendered desktop callout and the client-side Mac
// links. Kept out of "use client" modules so server components can call them.

// Plausible tagged-event class names, counted as custom goals
export const trackDownload = (platform: string) =>
  `plausible-event-name=Desktop+Download plausible-event-platform=${platform}`;

export const licensedDownloadClass =
  "text-petrol-600 border-petrol-950/8 mt-4 border-t pt-3 text-xs leading-5";
