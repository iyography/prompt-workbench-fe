"use client";

import { useState } from "react";
import { useBackendQuery, useBackendMutation } from "@/hooks/networking";

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  last_login: string | null;
  is_admin: boolean;
  admin_privileges: {
    is_super_admin: boolean;
    can_manage_users: boolean;
    can_manage_plays: boolean;
    can_view_analytics: boolean;
  } | null;
}

export function AdminUsers() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPrivilegeModal, setShowPrivilegeModal] = useState(false);

  const { data: users, isLoading, refetch } = useBackendQuery<User[]>(
    "admin/users/",
    "GET",
    { shouldCacheResponse: false }
  );

  const updatePrivilegesMutation = useBackendMutation<{ message: string }, any>(
    `admin/users/${selectedUser?.id}/privileges/`,
    "POST",
    { shouldCacheResponse: false }
  );

  const handleUpdatePrivileges = async (privileges: any) => {
    if (!selectedUser) return;

    try {
      await updatePrivilegesMutation.mutateAsync(privileges);
      setShowPrivilegeModal(false);
      setSelectedUser(null);
      refetch();
    } catch (error) {
      console.error("Failed to update privileges:", error);
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

  if (!users) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          Failed to load users data
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
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
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin Privileges
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.username}
                      </div>
                      <div className="text-sm text-gray-500">
                        {user.email}
                      </div>
                      <div className="text-xs text-gray-400">
                        {user.first_name} {user.last_name}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.admin_privileges ? (
                      <div className="space-y-1">
                        {user.admin_privileges.is_super_admin && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Super Admin
                          </span>
                        )}
                        {user.admin_privileges.can_manage_users && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            User Management
                          </span>
                        )}
                        {user.admin_privileges.can_manage_plays && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Play Management
                          </span>
                        )}
                        {user.admin_privileges.can_view_analytics && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                            Analytics
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">No privileges</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowPrivilegeModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Manage Privileges
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Privilege Management Modal */}
      {showPrivilegeModal && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Manage Privileges for {selectedUser.username}
              </h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const privileges = {
                  is_super_admin: formData.get('is_super_admin') === 'on',
                  can_manage_users: formData.get('can_manage_users') === 'on',
                  can_manage_plays: formData.get('can_manage_plays') === 'on',
                  can_view_analytics: formData.get('can_view_analytics') === 'on',
                };
                handleUpdatePrivileges(privileges);
              }}>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="is_super_admin"
                      defaultChecked={selectedUser.admin_privileges?.is_super_admin || false}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Super Admin</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="can_manage_users"
                      defaultChecked={selectedUser.admin_privileges?.can_manage_users || false}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">User Management</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="can_manage_plays"
                      defaultChecked={selectedUser.admin_privileges?.can_manage_plays || false}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Play Management</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="can_view_analytics"
                      defaultChecked={selectedUser.admin_privileges?.can_view_analytics || false}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Analytics Access</span>
                  </label>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPrivilegeModal(false);
                      setSelectedUser(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updatePrivilegesMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {updatePrivilegesMutation.isPending ? "Updating..." : "Update"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
