"use client";

import { useState } from "react";
import { useBackendQuery, useBackendMutation } from "@/hooks/networking";
import { Pencil, Trash, Plus, Eye } from "@phosphor-icons/react";

interface CompanyVariables {
  company_id: number;
  company_name: string;
  variables: Record<string, string[]>;
  variables_with_usage?: Record<string, {
    values: string[];
    usage_count: number;
    used_by_plays: Array<{ id: number; name: string }>;
  }>;
}

export function AdminVariables() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVariable, setEditingVariable] = useState<string | null>(null);
  const [variableName, setVariableName] = useState("");
  const [variableValues, setVariableValues] = useState(["", "", ""]);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewVariable, setPreviewVariable] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewResult, setPreviewResult] = useState("");

  const { data: companyVars, isLoading, refetch } = useBackendQuery<CompanyVariables>(
    "admin/company-variables/",
    { shouldCacheResponse: false }
  );

  const createMutation = useBackendMutation<
    { name: string; values: string[] },
    { message: string; variables: Record<string, string[]> }
  >("admin/company-variables/create/", "POST", {
    onSuccess: () => {
      refetch();
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useBackendMutation<
    { values: string[] },
    { message: string; variables: Record<string, string[]> }
  >(
    (data) => `admin/company-variables/${editingVariable}/update/`,
    "PUT",
    {
      onSuccess: () => {
        refetch();
        setEditingVariable(null);
        resetForm();
      },
    }
  );

  const deleteMutation = useBackendMutation<
    {},
    { message: string }
  >(
    (data) => `admin/company-variables/${editingVariable}/delete/`,
    "DELETE",
    {
      onSuccess: () => {
        refetch();
        setEditingVariable(null);
      },
    }
  );

  const resetForm = () => {
    setVariableName("");
    setVariableValues(["", "", ""]);
  };

  const handleCreate = async () => {
    await createMutation.mutateAsync({ name: variableName, values: variableValues });
  };

  const handleUpdate = async () => {
    await updateMutation.mutateAsync({ values: variableValues });
  };

  const handleEdit = (varName: string) => {
    setEditingVariable(varName);
    setVariableName(varName);
    setVariableValues(companyVars?.variables[varName] || ["", "", ""]);
  };

  const handleDelete = async (varName: string) => {
    if (confirm(`Are you sure you want to delete "${varName}"?`)) {
      setEditingVariable(varName);
      await deleteMutation.mutateAsync({});
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">Company Variables</h3>
          <p className="text-sm text-gray-600">
            Manage template variables available in all plays
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} weight="bold" />
          Create Variable
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search variables..."
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Variables List */}
      <div className="space-y-3">
        {Object.entries(companyVars?.variables || {})
          .filter(([varName]) => 
            varName.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(([varName, values]) => (
          <div
            key={varName}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                    {`{${varName}}`}
                  </code>
                  <span className="text-xs text-gray-500">
                    {values.length} variant{values.length !== 1 ? 's' : ''}
                  </span>
                  {/* Usage badge */}
                  {(companyVars?.variables_with_usage?.[varName]?.usage_count ?? 0) > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      Used in {companyVars?.variables_with_usage?.[varName]?.usage_count} play(s)
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {values.map((value, idx) => (
                    <div key={idx} className="text-sm text-gray-600 truncate">
                      <span className="font-medium">[{idx}]:</span> {value.substring(0, 100)}
                      {value.length > 100 && '...'}
                    </div>
                  ))}
                </div>
                {/* Show which plays use this variable */}
                {(companyVars?.variables_with_usage?.[varName]?.used_by_plays?.length ?? 0) > 0 && (
                  <div className="text-xs text-gray-500 mt-2">
                    <span className="font-medium">Used by: </span>
                    {companyVars?.variables_with_usage?.[varName]?.used_by_plays
                      ?.slice(0, 3)
                      .map(p => p.name)
                      .join(', ')}
                    {(companyVars?.variables_with_usage?.[varName]?.used_by_plays?.length ?? 0) > 3 && 
                      ` +${(companyVars?.variables_with_usage?.[varName]?.used_by_plays?.length ?? 0) - 3} more`
                    }
                  </div>
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => setPreviewVariable(varName)}
                  className="p-2 text-green-600 hover:bg-green-50 rounded"
                  title="Preview"
                >
                  <Eye size={20} />
                </button>
                <button
                  onClick={() => handleEdit(varName)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit"
                >
                  <Pencil size={20} />
                </button>
                <button
                  onClick={() => handleDelete(varName)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash size={20} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingVariable) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingVariable ? `Edit Variable: ${variableName}` : 'Create New Variable'}
            </h3>
            
            {!editingVariable && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Variable Name</label>
                <input
                  type="text"
                  value={variableName}
                  onChange={(e) => setVariableName(e.target.value)}
                  placeholder="e.g., format_output"
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use letters, numbers, and underscores only
                </p>
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Values (Cycle through variants)
              </label>
              {variableValues.map((value, idx) => (
                <div key={idx} className="mb-2">
                  <label className="block text-xs text-gray-600 mb-1">Variant {idx + 1}</label>
                  <textarea
                    value={value}
                    onChange={(e) => {
                      const newValues = [...variableValues];
                      newValues[idx] = e.target.value;
                      setVariableValues(newValues);
                    }}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  />
                </div>
              ))}
              <button
                onClick={() => setVariableValues([...variableValues, ""])}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add Another Variant
              </button>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingVariable(null);
                  resetForm();
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={editingVariable ? handleUpdate : handleCreate}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {editingVariable ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewVariable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h3 className="text-xl font-bold mb-4">
              Preview Variable: {`{${previewVariable}}`}
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Enter text with {`{${previewVariable}}`} to preview substitution
              </label>
              <textarea
                value={previewText}
                onChange={(e) => {
                  setPreviewText(e.target.value);
                  // Simple preview - replace variable with first variant value
                  const varValue = companyVars?.variables[previewVariable]?.[0] || '';
                  const result = e.target.value.replace(
                    new RegExp(`\\{${previewVariable}\\??\\}`, 'g'),
                    varValue
                  );
                  setPreviewResult(result);
                }}
                rows={4}
                className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                placeholder={`Example: "Your tone should be {${previewVariable}}"`}
              />
            </div>
            
            {previewText && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Preview Result (Variant 1):</label>
                <div className="bg-gray-50 p-3 rounded-lg text-sm whitespace-pre-wrap">
                  {previewResult}
                </div>
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setPreviewVariable(null);
                  setPreviewText('');
                  setPreviewResult('');
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
