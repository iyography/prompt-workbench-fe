"use client";
import {HubspotApiUrlService} from "@/utils/HubspotApiUrlService";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Nango from "@nangohq/frontend";
import HubspotContacts from "../../components/integrations/HubspotContacts";
import HubspotDeals, {
  getDeals,
} from "../../components/integrations/HubspotDeals";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBackendQuery } from "../../hooks/networking";
import { Profile } from "../../models/profile";
import HubspotCompanies from "../../components/integrations/HubspotCompanies";


const hubspotApiUrlService = HubspotApiUrlService.create();

export default function IntegrationsPage() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const { data: profile, isLoading: loadingProfile } =
    useBackendQuery<Profile>("profile/");

  const { data: connectionData, isLoading: loadingConnection } = useQuery({
    queryKey: ["hubspot-connection"],
    queryFn: async () => {
      if (!profile?.id) return null;
      const response = await fetch(hubspotApiUrlService.connection(profile.id));
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!profile,
  });

  const client = useQueryClient();

  const connectHubspot = async () => {
    if (!profile) return;
    setIsConnecting(true);
    setConnectionError(null);
    try {
      // Step 1: Get a connect session token from our backend
      const sessionResponse = await fetch("/api/hubspot/connect-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id }),
      });

      if (!sessionResponse.ok) {
        const error = await sessionResponse.json();
        throw new Error(error.error || "Failed to create connect session");
      }

      const { sessionToken } = await sessionResponse.json();

      // Step 2: Initialize Nango with the connect session token (new approach)
      const nango = new Nango({
        connectSessionToken: sessionToken,
      });

      // Step 3: Authenticate with HubSpot (pass profile.id as connectionId so the rest of the app can find it)
      const result = await nango.auth("hubspot", String(profile.id));

      if (result?.connectionId) {
        // Wait for connection to be fully established, then poll until data is available
        // HubSpot sync can take a few seconds after initial OAuth
        await waitForHubspotData(profile.id, client);
      }
    } catch (error: any) {
      const message = error?.message || "Failed to connect to HubSpot";
      console.error("Failed to connect to HubSpot:", error);
      setConnectionError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  // Poll for HubSpot data availability after connection
  const waitForHubspotData = async (profileId: number, queryClient: typeof client) => {
    const maxAttempts = 5;
    const delayMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Refetch connection status
      await queryClient.refetchQueries({ queryKey: ["hubspot-connection"] });

      // Check if connection data is now available
      const connectionResult = await fetch(hubspotApiUrlService.connection(profileId));
      if (connectionResult.ok) {
        const data = await connectionResult.json();
        if (data?.connection) {
          // Connection established, refetch all HubSpot data
          await queryClient.refetchQueries({ queryKey: ["hubspot"] });
          return;
        }
      }
    }

    // Even if polling exhausted, still try to refetch
    await queryClient.refetchQueries({ queryKey: ["hubspot"] });
  };

  const deleteHubspotConnection = async () => {
    if (!profile) return;
    setIsDeleting(true);
    try {
      const response = await fetch(hubspotApiUrlService.delete(profile.id),
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete connection");
      }

      client.refetchQueries({ queryKey: ["hubspot-connection"] });
      client.refetchQueries({ queryKey: ["hubspot"] });
    } catch (error) {
      console.error("Failed to delete HubSpot connection:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = loadingProfile || loadingConnection;
  const isConnected = !!connectionData?.connection;

  return (
    <div className="p-8 flex flex-col">
      <h1 className="text-4xl font-bold mb-8">Integrations</h1>

      <div className="bg-white rounded-2xl p-8 card">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold">HubSpot</h2>
            {isConnected && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-green-600">Connected to HubSpot</span>
              </div>
            )}
          </div>
          {isConnected && (
            <div>
              <button
                onClick={deleteHubspotConnection}
                disabled={isDeleting}
                className="btn-secondary text-red-600 hover:text-red-700 mx-2"
              >
                {isDeleting ? "Disconnecting..." : "Disconnect HubSpot"}
              </button>
              <button
                onClick={() => client.refetchQueries({ queryKey: ["hubspot"] })}
                disabled={isDeleting}
                className="btn-primary"
              >
                Refresh Data
              </button>
            </div>
          )}
        </div>

        {isConnecting || isLoading || !isConnected ? (
          <div>
            <button
              onClick={connectHubspot}
              disabled={isConnecting}
              className="btn-primary"
            >
              {isConnecting || isLoading ? "Connecting..." : "Connect to HubSpot"}
            </button>
            {connectionError && (
              <p className="mt-3 text-sm text-red-600">{connectionError}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg border border-gray-200">
              <HubspotContacts />
            </div>
            <div className="bg-white rounded-lg border border-gray-200">
              <HubspotDeals />
            </div>
            <div className="bg-white rounded-lg border border-gray-200">
              <HubspotCompanies />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
