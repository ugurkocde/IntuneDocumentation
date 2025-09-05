import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (
        pathname: string,
        /* clientPayload */
      ) => {
        // Generate a client token for the browser to upload the file
        // ⚠️ Authenticate and authorize users before generating the token.
        
        // Verify authentication from the request headers
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          throw new Error("Unauthorized");
        }
        
        return {
          allowedContentTypes: ['application/json'],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB max
          tokenPayload: JSON.stringify({
            // Optional metadata
            uploadedAt: new Date().toISOString(),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Get notified of client upload completion
        // ⚠️ This will not work on `localhost` websites,
        // Use ngrok or similar to get the full upload flow
        
        console.log('Blob upload completed:', blob.url, tokenPayload);
        
        // The blob URL is now available
        // You could store it in a database here if needed
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Error in handleUpload:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }, // The webhook will retry 5 times waiting for a 200
    );
  }
}