import { Client } from "@microsoft/microsoft-graph-client";

interface TokenValidationResult {
  isValid: boolean;
  error?: string;
  needsRefresh?: boolean;
}

export async function validateToken(accessToken: string): Promise<TokenValidationResult> {
  try {
    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    // Try a simple API call to validate the token
    await client.api("/me").select("id").get();
    
    return { isValid: true };
  } catch (error: any) {
    if (error?.statusCode === 401) {
      return { 
        isValid: false, 
        error: "Token expired or invalid", 
        needsRefresh: true 
      };
    }
    
    if (error?.statusCode === 403) {
      return { 
        isValid: false, 
        error: "Insufficient permissions" 
      };
    }
    
    return { 
      isValid: false, 
      error: "Token validation failed" 
    };
  }
}

export function parseJwt(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const base64Url = parts[1];
    if (!base64Url) return null;
    
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  
  const expirationTime = payload.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  
  return currentTime >= (expirationTime - bufferTime);
}