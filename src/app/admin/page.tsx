"use client";

import { useState, useEffect } from "react";
import { useBackendMutation, useBackendQuery } from "@/hooks/networking";
import { isUserAuthenticated } from "@/utils/auth";
import { useRouter } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminPlays } from "@/components/admin/AdminPlays";
import { AdminGroups } from "@/components/admin/AdminGroups";
import { AdminCredits } from "@/components/admin/AdminCredits";
import { AdminSettings } from "@/components/admin/AdminSettings";

type AdminTab = "dashboard" | "users" | "plays" | "groups" | "credits" | "settings";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  // Check if user is authenticated and has admin privileges
  const { data: adminCheck, isLoading: checkingAdmin } = useBackendQuery<{
    is_admin: boolean;
    privileges: any;
  }>("admin/check/", "GET", {
    shouldCacheResponse: false,
  });

  useEffect(() => {
    if (!isUserAuthenticated()) {
      router.push("/login");
      return;
    }

    if (adminCheck && !adminCheck.is_admin) {
      router.push("/");
      return;
    }

    if (adminCheck) {
      setIsAdmin(adminCheck.is_admin);
    }
  }, [adminCheck, router]);

  if (checkingAdmin || isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Checking admin privileges...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">Access denied. Admin privileges required.</div>
      </div>
    );
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "users", label: "User Management", icon: "👥" },
    { id: "plays", label: "Play Sharing", icon: "💼" },
    { id: "groups", label: "Groups", icon: "🏷️" },
    { id: "credits", label: "Credits", icon: "💰" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <p className="mt-2 text-gray-600">
            Manage users, plays, and system settings
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow">
          {activeTab === "dashboard" && <AdminDashboard />}
          {activeTab === "users" && <AdminUsers />}
          {activeTab === "plays" && <AdminPlays />}
          {activeTab === "groups" && <AdminGroups />}
          {activeTab === "credits" && <AdminCredits />}
          {activeTab === "settings" && <AdminSettings />}
        </div>
      </div>
    </div>
  );
}
