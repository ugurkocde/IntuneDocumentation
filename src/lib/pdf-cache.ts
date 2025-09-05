// In-memory cache for PDF generation configurations
// This is used to store large configuration data temporarily
// to avoid sending it in the request body (which has size limits on Vercel)

interface CacheEntry {
  data: any;
  timestamp: number;
  token: string;
}

export const configCache = new Map<string, CacheEntry>();

// Clean up old entries every 5 minutes
if (typeof window === 'undefined') { // Only run on server
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of configCache.entries()) {
      // Remove entries older than 10 minutes
      if (now - value.timestamp > 10 * 60 * 1000) {
        configCache.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}