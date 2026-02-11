"use client";

import { useBackendQuery } from "@/hooks/networking";
import { Profile } from "@/models/profile";
import { useHubspotContacts } from "@/hooks/useHubspot";
import { useState, useEffect } from "react";
import { formatDate } from "@/utils/formatting";
import { Contact } from "@/types/hubspot";

export default function HubspotContacts() {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);

  const { data: profile, isLoading: loadingProfile } =
    useBackendQuery<Profile>("profile/");

  const { data, isLoading, error, isFetching } = useHubspotContacts(
    profile?.id,
    {
      enabled: !!profile?.id,
    },
    undefined,
    false, // fetchAll = false, so we only get 100 at a time
    cursor,
  );

  // When data loads for the first time, set allContacts and pagination state
  useEffect(() => {
    if (data?.results?.data && !cursor) {
      setAllContacts(data.results.data);
      setNextCursor(data.pagination?.nextCursor);
      setHasMore(!!data.pagination?.hasMore);
    }
  }, [data, cursor]);

  // When loading more, append to existing contacts and update pagination state
  useEffect(() => {
    if (data?.results?.data && cursor && isLoadingMore) {
      setAllContacts((prev) => [...prev, ...data.results.data]);
      setNextCursor(data.pagination?.nextCursor);
      setHasMore(!!data.pagination?.hasMore);
      setIsLoadingMore(false);
    }
  }, [data, cursor, isLoadingMore, allContacts.length]);

  const contacts = allContacts;
  
  // Show loading only on initial load (not when loading more)
  if ((isLoading || isFetching) && !isLoadingMore && allContacts.length === 0) {
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

  const handleLoadMore = () => {
    if (!nextCursor || isLoadingMore) return;
    
    setIsLoadingMore(true);
    setCursor(nextCursor);
  };

  // Debug pagination state
  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">
        Hubspot Contacts {contacts.length > 0 && `(${contacts.length})`}
        {hasMore && <span className="ml-2 text-sm text-blue-600">(More available)</span>}
      </h3>
      <div className="max-h-[300px] overflow-y-auto pr-2">
        <div className="space-y-4">
          {!contacts || contacts.length === 0 ? (
            <p>No contacts found</p>
          ) : (
            <>
              {contacts.map((contact) => {
              const isExpanded = expandedCards.has(contact.id);

              return (
                <div
                  key={contact.id}
                  className="bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="p-4">
                    {/* Main Information */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 mr-4 break-words">
                        <h4 className="text-lg font-medium mb-1">
                          {contact.firstname} {contact.lastname}
                        </h4>
                        <div className="text-sm space-y-1">
                          {contact.email && (
                            <p className="text-gray-600 break-all">
                              {contact.email}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleCard(contact.id)}
                        className="text-gray-500 hover:text-gray-700 flex-shrink-0"
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </div>

                    {/* Properties */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(contact.properties).map(
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
                        {contact._nango_metadata && (
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
                                    contact._nango_metadata.first_seen_at,
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-col break-words">
                                <span className="text-sm font-medium text-gray-600">
                                  Last Modified
                                </span>
                                <span className="text-sm text-gray-900">
                                  {formatDate(
                                    contact._nango_metadata.last_modified_at,
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-col break-words">
                                <span className="text-sm font-medium text-gray-600">
                                  Last Action
                                </span>
                                <span className="text-sm text-gray-900">
                                  {contact._nango_metadata.last_action}
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
            })}
            
            {/* Load More Button - Always show debug info */}
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
              <div className="text-xs text-gray-600 mb-2">
                Debug: hasMore={String(hasMore)}, nextCursor={nextCursor ? 'exists' : 'null'}
              </div>
              {hasMore ? (
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingMore ? "Loading..." : "Load More Contacts (100)"}
                </button>
              ) : (
                <div className="text-center text-sm text-gray-500">
                  All contacts loaded
                </div>
              )}
            </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
