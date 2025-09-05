import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Verify authentication before allowing upload
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          throw new Error("Unauthorized");
        }
        
        return {
          allowedContentTypes: ['application/json'],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB max
        };
      },
      onUploadCompleted: async () => {
        // This function is called after the upload is complete
        // You can perform additional operations here if needed
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}