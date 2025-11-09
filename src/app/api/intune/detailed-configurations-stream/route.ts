import type { NextRequest } from "next/server";
import { DetailedIntuneService } from "~/lib/intune-detailed-client";

export const maxDuration = 120; // Increased from 60s to 120s for better reliability with large tenants
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const accessToken = authHeader.replace("Bearer ", "");

  // Create a readable stream for Server-Sent Events
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Helper function to send SSE event
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        // Send initial connection event
        sendEvent('connected', { message: 'Connected to configuration stream' });

        // Send progress event: Connecting to Graph API
        sendEvent('progress', {
          step: 'Connecting to Microsoft Graph API',
          stepIndex: 0,
          status: 'loading'
        });

        // Create service with progress callback
        const service = new DetailedIntuneService(accessToken, (progressEvent) => {
          // Emit progress events to the client
          sendEvent('progress', {
            step: progressEvent.step,
            type: progressEvent.type,
            current: progressEvent.current,
            total: progressEvent.total,
            message: progressEvent.message,
            status: 'loading'
          });
        });

        // Mark connection as completed
        sendEvent('progress', {
          step: 'Connecting to Microsoft Graph API',
          stepIndex: 0,
          status: 'completed'
        });

        // Send progress events for each policy type
        const policyTypes = [
          { name: 'Settings Catalog', stepIndex: 1 },
          { name: 'Device Configurations', stepIndex: 2 },
          { name: 'Administrative Templates', stepIndex: 3 },
          { name: 'Security Baselines', stepIndex: 4 },
          { name: 'Compliance Policies', stepIndex: 5 },
          { name: 'App Protection Policies', stepIndex: 6 },
          { name: 'Scripts', stepIndex: 7 },
          { name: 'App Configurations', stepIndex: 8 },
          { name: 'Windows Update Policies', stepIndex: 9 },
          { name: 'Enrollment Configurations', stepIndex: 10 },
        ];

        // Mark all as loading
        policyTypes.forEach(type => {
          sendEvent('progress', {
            step: type.name,
            stepIndex: type.stepIndex,
            status: 'loading'
          });
        });

        // Fetch all configurations
        const configurations = await service.getAllDetailedConfigurations();

        // Mark all as completed
        policyTypes.forEach(type => {
          sendEvent('progress', {
            step: type.name,
            stepIndex: type.stepIndex,
            status: 'completed'
          });
        });

        // Send final data
        sendEvent('complete', {
          data: configurations,
          message: 'All configurations fetched successfully'
        });

        // Close the stream
        controller.close();
      } catch (error: any) {
        console.error('Error in SSE stream:', error);

        const errorMessage = `event: error\ndata: ${JSON.stringify({
          error: error?.message || 'Failed to fetch configurations',
          details: error?.stack
        })}\n\n`;

        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
    },
  });
}
