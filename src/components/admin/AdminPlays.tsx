"use client";

import { useState } from "react";
import { useBackendQuery, useBackendMutation } from "@/hooks/networking";

interface Play {
  id: number;
  name: string;
  category: string;
  output_type: string;
  shared_with_users: string[];
  shared_with_groups: string[];
  total_shares: number;
}

interface SearchResult {
  id: number;
  username?: string;
  name?: string;
  email?: string;
  category?: string;
}

export function AdminPlays() {
  const [selectedPlay, setSelectedPlay] = useState<Play | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<"user" | "group">("user");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { data: plays, isLoading, refetch } = useBackendQuery<Play[]>(
    "admin/plays/",
    "GET",
    { shouldCacheResponse: false }
  );

  const sharePlayMutation = useBackendMutation<
    { permission_level: string; shared_with_user?: number; shared_with_group?: number },
    { message: string }
  >(
    `admin/plays/${selectedPlay?.id}/share/`,
    "POST",
    { shouldCacheResponse: false }
  );

  const searchUsersMutation = useBackendMutation<
    { q: string },
    SearchResult[]
  >(
    "admin/search/users/",
    "POST",
    { shouldCacheResponse: false }
  );

  const searchPlaysMutation = useBackendMutation<
    { q: string },
    SearchResult[]
  >(
    "admin/search/plays/",
    "POST",
    { shouldCacheResponse: false }
  );

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      if (shareType === "user") {
        const result = await searchUsersMutation.mutateAsync({ q: searchQuery });
        setSearchResults(result);
      } else {
        const result = await searchPlaysMutation.mutateAsync({ q: searchQuery });
        setSearchResults(result);
      }
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSharePlay = async (targetId: number, permissionLevel: string) => {
    if (!selectedPlay) return;

    try {
      const shareData = {
        permission_level: permissionLevel,
        ...(shareType === "user" 
          ? { shared_with_user: targetId }
          : { shared_with_group: targetId }
        ),
      };

      await sharePlayMutation.mutateAsync(shareData);
      setShowShareModal(false);
      setSelectedPlay(null);
      setSearchQuery("");
      setSearchResults([]);
      refetch();
    } catch (error) {
      console.error("Failed to share play:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!plays) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          Failed to load plays data
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Play Sharing Management</h2>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Play
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shared With
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                              {plays.map((play) => (
                <tr key={play.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {play.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {play.output_type}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {play.category || "Uncategorized"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {play.total_shares > 0 ? (
                        <div>
                          {play.shared_with_users.length > 0 && (
                            <div className="mb-1">
                              <span className="font-medium">Users:</span> {play.shared_with_users.join(", ")}
                            </div>
                          )}
                          {play.shared_with_groups.length > 0 && (
                            <div>
                              <span className="font-medium">Groups:</span> {play.shared_with_groups.join(", ")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Not shared</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setSelectedPlay(play);
                        setShowShareModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Share Play
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Share Play Modal */}
      {showShareModal && selectedPlay && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Share Play: {selectedPlay.name}
              </h3>
              
              <div className="space-y-4">
                {/* Share Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Share with:
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="shareType"
                        value="user"
                        checked={shareType === "user"}
                        onChange={(e) => setShareType(e.target.value as "user" | "group")}
                        className="mr-2"
                      />
                      User
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="shareType"
                        value="group"
                        checked={shareType === "group"}
                        onChange={(e) => setShareType(e.target.value as "user" | "group")}
                        className="mr-2"
                      />
                      Group
                    </label>
                  </div>
                </div>

                {/* Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search {shareType === "user" ? "Users" : "Groups"}:
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search ${shareType === "user" ? "users" : "groups"}...`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={isSearching}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isSearching ? "..." : "Search"}
                    </button>
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select {shareType === "user" ? "User" : "Group"}:
                    </label>
                    <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md">
                      {searchResults.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => handleSharePlay(result.id, "view")}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b border-gray-200 last:border-b-0"
                        >
                          <div className="font-medium">
                            {shareType === "user" ? result.username : result.name}
                          </div>
                          {shareType === "user" && result.email && (
                            <div className="text-sm text-gray-500">{result.email}</div>
                          )}
                          {shareType === "group" && result.category && (
                            <div className="text-sm text-gray-500">{result.category}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Permission Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Permission Level:
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    <option value="view">View Only</option>
                    <option value="edit">Edit</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowShareModal(false);
                    setSelectedPlay(null);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
