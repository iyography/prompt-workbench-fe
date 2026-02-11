"use client";

import { useBackendQuery } from "@/hooks/networking";
import { Profile } from "@/models/profile";
import { useHubspotCompanies } from "@/hooks/useHubspot";
import { useState } from "react";
import { formatDate } from "@/utils/formatting";

export default function HubspotCompanies() {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { data: profile, isLoading: loadingProfile } =
    useBackendQuery<Profile>("profile/");

  const { data, isLoading, error, isFetching } = useHubspotCompanies(
    profile?.id || null,
    {
      enabled: !!profile?.id,
    },
  );

  const companies = data?.results?.data;
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
      <h3 className="text-lg font-semibold mb-4">Hubspot Companies</h3>
      <div className="max-h-[300px] overflow-y-auto pr-2">
        <div className="space-y-4">
          {!companies || companies.length === 0 ? (
            <p>No companies found</p>
          ) : (
            companies.map((company) => {
              const isExpanded = expandedCards.has(company.id);

              return (
                <div
                  key={company.id}
                  className="bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="p-4">
                    {/* Main Information */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 mr-4 break-words">
                        <h4 className="text-lg font-medium mb-1">
                          {company.name || company.properties.name.value}
                        </h4>
                        <div className="text-sm space-y-1">
                          {company.domain && (
                            <p>
                              <a
                                href={`https://${company.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                              >
                                {company.domain}
                              </a>
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleCard(company.id)}
                        className="text-gray-500 hover:text-gray-700 flex-shrink-0"
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </div>

                    {/* Timestamps */}
                    <div className="text-sm text-gray-500 space-y-1 break-words">
                      {company.created_at && (
                        <p>Created: {formatDate(company.created_at)}</p>
                      )}
                      {company.updated_at && (
                        <p>Updated: {formatDate(company.updated_at)}</p>
                      )}
                    </div>

                    {/* Properties */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(company.properties).map(
                            ([key, prop]) => (
                              <div
                                key={key}
                                className="flex flex-col break-words"
                              >
                                <span className="text-sm font-medium text-gray-600">
                                  {prop.label}
                                </span>
                                <span className="text-sm text-gray-900">
                                  {typeof prop.value === "string" &&
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
                        {company._nango_metadata && (
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
                                    company._nango_metadata.first_seen_at,
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-col break-words">
                                <span className="text-sm font-medium text-gray-600">
                                  Last Modified
                                </span>
                                <span className="text-sm text-gray-900">
                                  {formatDate(
                                    company._nango_metadata.last_modified_at,
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-col break-words">
                                <span className="text-sm font-medium text-gray-600">
                                  Last Action
                                </span>
                                <span className="text-sm text-gray-900">
                                  {company._nango_metadata.last_action}
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
