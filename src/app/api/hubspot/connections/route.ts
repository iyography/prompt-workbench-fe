import { Nango } from "@nangohq/node";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("connectionId");

    if (!connectionId) {
      return NextResponse.json(
        { error: "Connection ID is required" },
        { status: 400 },
      );
    }

    // Initialize Nango inside the handler to avoid build-time errors
    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY || "" });

    const connection = await nango.getConnection("hubspot", connectionId);
    return NextResponse.json({ connection });
  } catch (error) {
    console.error("Failed to get HubSpot connections:", error);
    return NextResponse.json(
      { error: "Failed to get connections" },
      { status: 500 },
    );
  }
}
