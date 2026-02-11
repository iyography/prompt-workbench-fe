"use client";

import { useState } from "react";
import { useBackendQuery, useBackendMutation } from "@/hooks/networking";

interface GroupMember {
  id: number;
  username: string;
  email: string;
  role: string;
  added_by_username: string;
  added_at: string;
}

interface Group {
  id: number;
  name: string;
  description: string;
  created_by_username: string;
  created_at: string;
  member_count: number;
  members: GroupMember[];
}

export function AdminGroups() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [newGroupData, setNewGroupData] = useState({ name: "", description: "" });

  const { data: groups, isLoading, refetch } = useBackendQuery<Group[]>(
    "admin/groups/",
    "GET",
    { shouldCacheResponse: false }
  );

  const createGroupMutation = useBackendMutation<
    { name: string; description: string },
    { message: string }
  >(
    "admin/groups/create/",
    "POST",
    { shouldCacheResponse: false }
  );

  const addMemberMutation = useBackendMutation<
    { user_id: number; role: string },
    { message: string }
  >(
    `admin/groups/${selectedGroup?.id}/members/`,
    "POST",
    { shouldCacheResponse: false }
  );

  const handleCreateGroup = async () => {
    try {
      await createGroupMutation.mutateAsync(newGroupData);
      setShowCreateModal(false);
      setNewGroupData({ name: "", description: "" });
      refetch();
    } catch (error) {
      console.error("Failed to create group:", error);
    }
  };

  const handleAddMember = async (userId: number, role: string) => {
    if (!selectedGroup) return;

    try {
      await addMemberMutation.mutateAsync({ user_id: userId, role });
      setShowAddMemberModal(false);
      setSelectedGroup(null);
      refetch();
    } catch (error) {
      console.error("Failed to add member:", error);
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

  if (!groups) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          Failed to load groups data
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Group Management</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Create Group
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {groups.map((group) => (
          <div key={group.id} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">{group.name}</h3>
                <p className="text-sm text-gray-500">{group.description}</p>
              </div>
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                {group.member_count} members
              </span>
            </div>
            
            <div className="text-sm text-gray-500 mb-4">
              Created by {group.created_by_username} on {new Date(group.created_at).toLocaleDateString()}
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Members:</h4>
              <div className="space-y-2">
                {group.members.map((member) => (
                  <div key={member.id} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium">{member.username}</span>
                      <span className="text-gray-500 ml-2">({member.role})</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      Added by {member.added_by_username}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedGroup(group);
                setShowAddMemberModal(true);
              }}
              className="w-full px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50"
            >
              Add Member
            </button>
          </div>
        ))}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Group</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group Name:
                  </label>
                  <input
                    type="text"
                    value={newGroupData.name}
                    onChange={(e) => setNewGroupData({ ...newGroupData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter group name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description:
                  </label>
                  <textarea
                    value={newGroupData.description}
                    onChange={(e) => setNewGroupData({ ...newGroupData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter group description"
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewGroupData({ name: "", description: "" });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupData.name.trim() || createGroupMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {createGroupMutation.isPending ? "Creating..." : "Create Group"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && selectedGroup && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Add Member to {selectedGroup.name}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User ID:
                  </label>
                  <input
                    type="number"
                    id="userId"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter user ID"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role:
                  </label>
                  <select
                    id="role"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Group Admin</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowAddMemberModal(false);
                    setSelectedGroup(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const userId = (document.getElementById('userId') as HTMLInputElement).value;
                    const role = (document.getElementById('role') as HTMLSelectElement).value;
                    if (userId) {
                      handleAddMember(parseInt(userId), role);
                    }
                  }}
                  disabled={addMemberMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {addMemberMutation.isPending ? "Adding..." : "Add Member"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
