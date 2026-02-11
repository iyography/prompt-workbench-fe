"use client";
import { useBackendQuery } from "@/hooks/networking";
import { Profile } from "@/models/profile";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Deal, HubspotResponse } from "@/types/hubspot";
import { formatDate, formatCurrency } from "@/utils/formatting";
import {HubspotApiUrlService} from "@/utils/HubspotApiUrlService";

``
const hubspotApiUrlService = HubspotApiUrlService.create();


export const getDeals = async (id?: number) => {


  const url = hubspotApiUrlService.deals(id)
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch deals");
  }

  return data as HubspotResponse<Deal>;
};


export default function HubspotDeals() {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { data: profile, isLoading: loadingProfile } =
    useBackendQuery<Profile>("profile/");

  const { data, isLoading, error, isFetching } = useQuery<
    HubspotResponse<Deal>
  >({
    queryKey: ["hubspot", "deals"],
    queryFn: () => getDeals(profile?.id),
    enabled: !!profile,
    retry: false,
  });

  const deals = data?.results?.data;
  if (isLoading || isFetching) {
    return <div className="p-4">Loading data...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">{(error as Error).message}</div>;
  }

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">Hubspot Deals</h3>
      <div className="max-h-[300px] overflow-y-auto pr-2">
        <div className="space-y-4">
          {!deals || deals.length === 0 ? (
            <p>No deals found</p>
          ) : (
            deals.map((deal) => {
              const isExpanded = expandedCards.has(deal.id);

              return (
                <div
                  key={deal.id}
                  className="bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="p-4">
                    {/* Main Information */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 mr-4 break-words">
                        <h4 className="text-lg font-medium mb-1">
                          {deal.name}
                        </h4>
                        <div className="text-sm space-y-1">
                          {deal.amount && (
                            <p className="text-green-600 font-medium">
                              {formatCurrency(deal.amount)}
                            </p>
                          )}
                          {deal.stage && (
                            <p className="text-gray-600">{deal.stage}</p>
                          )}
                          {deal.close_date && (
                            <p className="text-gray-600">
                              Close Date: {formatDate(deal.close_date)}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleCard(deal.id)}
                        className="text-gray-500 hover:text-gray-700 flex-shrink-0"
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </div>

                    {/* Properties */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(deal.properties).map(
                            ([key, prop]) => (
                              <div
                                key={key}
                                className="flex flex-col break-words"
                              >
                                <span className="text-sm font-medium text-gray-600">
                                  {prop.label}
                                </span>
                                <span className="text-sm text-gray-900">
                                  {typeof prop.value === "number" &&
                                  key.toLowerCase().includes("amount")
                                    ? formatCurrency(prop.value)
                                    : typeof prop.value === "string" &&
                                        (key.toLowerCase().includes("date") ||
                                          key.toLowerCase().includes("time"))
                                      ? formatDate(prop.value)
                                      : String(prop.value)}
                                </span>
                              </div>
                            ),
                          )}
                        </div>

                        {/* Metadata */}
                        {deal._nango_metadata && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h5 className="text-sm font-medium text-gray-500 mb-2">
                              Metadata
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col break-words">
                                <span className="text-sm font-medium text-gray-600">
                                  First Seen
                                </span>
                                <span className="text-sm text-gray-900">
                                  {formatDate(
                                    deal._nango_metadata.first_seen_at,
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-col break-words">
                                <span className="text-sm font-medium text-gray-600">
                                  Last Modified
                                </span>
                                <span className="text-sm text-gray-900">
                                  {formatDate(
                                    deal._nango_metadata.last_modified_at,
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-col break-words">
                                <span className="text-sm font-medium text-gray-600">
                                  Last Action
                                </span>
                                <span className="text-sm text-gray-900">
                                  {deal._nango_metadata.last_action}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
