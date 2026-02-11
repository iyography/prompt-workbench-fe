"use client";

import { useState } from "react";
import { AdminVariables } from "./AdminVariables";
import { AdminPlayEditor } from "./AdminPlayEditor";

type SettingsSection = "variables" | "plays";

export function AdminSettings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("variables");

  const sections = [
    { id: "variables", label: "Company Variables", icon: "📝" },
    { id: "plays", label: "Play Editor", icon: "🎭" },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
        <p className="text-gray-600 mt-1">Manage company variables and play templates</p>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as SettingsSection)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeSection === section.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="mr-2">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Section Content */}
      {activeSection === "variables" && <AdminVariables />}
      {activeSection === "plays" && <AdminPlayEditor />}
    </div>
  );
}

