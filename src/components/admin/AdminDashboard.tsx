"use client";

import { useBackendQuery } from "@/hooks/networking";
import { useState } from "react";

interface AdminStats {
  total_users: number;
  total_plays: number;
  total_companies: number;
  total_groups: number;
}

interface RecentShare {
  id: number;
  play_name: string;
  play_category: string;
  permission_level: string;
  shared_by_username: string;
  shared_with_username?: string;
  shared_with_group_name?: string;
  shared_at: string;
}

interface AdminDashboardData extends AdminStats {
  recent_shares?: RecentShare[];
}

export function AdminDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: dashboardData, isLoading, refetch } = useBackendQuery<AdminDashboardData>(
    "admin/dashboard/",
    "GET",
    { shouldCacheResponse: false }
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          Failed to load dashboard data
        </div>
      </div>
    );
  }

  // Debug: Log what we received
  const { total_users, total_plays, total_companies, total_groups, recent_shares = [] } = dashboardData;

  return (
    <div className="p-6">
      {/* Header with refresh button */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">System Overview</h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <span className="text-2xl">👥</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Users</p>
              <p className="text-2xl font-bold text-blue-900">{total_users}</p>
            </div>
          </div>
        </div>

                 <div className="bg-green-50 p-6 rounded-lg border border-green-200">
           <div className="flex items-center">
             <div className="p-2 bg-green-100 rounded-lg">
               <span className="text-2xl">💼</span>
             </div>
             <div className="ml-4">
               <p className="text-sm font-medium text-green-600">Total Plays</p>
               <p className="text-2xl font-bold text-green-900">{total_plays}</p>
             </div>
           </div>
         </div>

        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <span className="text-2xl">🏢</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-600">Companies</p>
              <p className="text-2xl font-bold text-purple-900">{total_companies}</p>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <span className="text-2xl">🏷️</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-orange-600">Share Groups</p>
              <p className="text-2xl font-bold text-orange-900">{total_groups}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Play Shares</h3>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Play
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shared With
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Permission
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shared By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recent_shares.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No recent play shares
                    </td>
                  </tr>
                ) : (
                  recent_shares.map((share) => (
                    <tr key={share.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {share.play_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {share.play_category}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {share.shared_with_username || share.shared_with_group_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {share.shared_with_username ? "User" : "Group"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          share.permission_level === 'admin' 
                            ? 'bg-red-100 text-red-800'
                            : share.permission_level === 'edit'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {share.permission_level}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {share.shared_by_username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(share.shared_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
