import { Nango } from "@nangohq/node";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    // Initialize Nango inside the handler to avoid build-time errors
    const secretKey = process.env.NANGO_SECRET_KEY || "";
    console.log(`[connect-session] Creating session for userId=${userId}, secretKey present: ${!!secretKey && secretKey.length > 0}`);
    const nango = new Nango({ secretKey });

    // Create a connect session for this user
    // The session token is short-lived (30 minutes) and can be used
    // by the frontend to initiate OAuth flows
    const connectSession = await nango.createConnectSession({
      end_user: {
        id: String(userId),
        display_name: `User ${userId}`,
      },
      allowed_integrations: ["hubspot"],
    });

    console.log(`[connect-session] Session created successfully, token length: ${connectSession.data.token?.length}`);

    return NextResponse.json({
      sessionToken: connectSession.data.token,
      expiresAt: connectSession.data.expires_at,
    });
  } catch (error) {
    console.error("Failed to create connect session:", error);
    return NextResponse.json(
      { error: "Failed to create connect session", details: String(error) },
      { status: 500 },
    );
  }
}
