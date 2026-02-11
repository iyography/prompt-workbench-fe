import { Nango } from "@nangohq/node";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
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

    await nango.deleteConnection("hubspot", connectionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete HubSpot connection:", error);
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 },
    );
  }
}
