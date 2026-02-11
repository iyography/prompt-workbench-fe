"use client";

import { useState } from "react";
import { useBackendQuery, useBackendMutation } from "@/hooks/networking";
import { Pencil, CaretDown, CaretRight, Copy } from "@phosphor-icons/react";

interface Play {
  id: number;
  name: string;
  category: string;
  output_type: string;
}

interface PlayDetail {
  id: number;
  name: string;
  category: string;
  output_type: string;
  play_steps: Array<{
    name?: string;
    user_instructions_template: string;
    system_instructions_template: string;
  }>;
  variables: Record<string, any>;
  variable_analysis?: {
    all_variables: string[];
    step_variables: Array<{
      step_index: number;
      step_name: string;
      variables: string[];
    }>;
  };
  validation?: {
    is_valid: boolean;
    missing_variables: string[];
    available_but_unused: string[];
    total_variables_used: number;
  };
}

export function AdminPlayEditor() {
  const [selectedPlay, setSelectedPlay] = useState<number | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [editingPlayId, setEditingPlayId] = useState<number | null>(null);
  const [editedPlayData, setEditedPlayData] = useState<PlayDetail | null>(null);

  const { data: plays, isLoading: loadingPlays } = useBackendQuery<Play[]>(
    "admin/plays/",
    { shouldCacheResponse: false }
  );

  const { data: playDetail, refetch: refetchDetail } = useBackendQuery<PlayDetail>(
    selectedPlay ? `admin/plays/${selectedPlay}/detail/` : "",
    { enabled: !!selectedPlay, shouldCacheResponse: false }
  );

  const updatePlayMutation = useBackendMutation<PlayDetail, { message: string; play: PlayDetail }>(
    `admin/plays/${editingPlayId}/update/`,
    "PUT",
    {
      onSuccess: () => {
        refetchDetail();
        setEditingPlayId(null);
        setEditedPlayData(null);
      },
    }
  );

  const clonePlayMutation = useBackendMutation<
    { name?: string },
    { message: string; cloned_play: { id: number; name: string } }
  >(
    `admin/plays/${selectedPlay}/clone/`,
    "POST",
    {
      onSuccess: (data) => {
        alert(`Play cloned successfully: ${data.cloned_play.name}`);
        // Optionally switch to the cloned play
        setSelectedPlay(data.cloned_play.id);
      },
    }
  );

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const startEdit = () => {
    if (playDetail) {
      setEditingPlayId(playDetail.id);
      setEditedPlayData(JSON.parse(JSON.stringify(playDetail)));
    }
  };

  const cancelEdit = () => {
    setEditingPlayId(null);
    setEditedPlayData(null);
  };

  const saveEdit = async () => {
    if (editedPlayData) {
      await updatePlayMutation.mutateAsync(editedPlayData);
    }
  };

  const handleClone = async () => {
    if (playDetail) {
      const newName = prompt(`Enter name for cloned play:`, `${playDetail.name} (Copy)`);
      if (newName) {
        await clonePlayMutation.mutateAsync({ name: newName });
      }
    }
  };

  const updateStepField = (stepIndex: number, field: string, value: string) => {
    if (editedPlayData) {
      const newSteps = [...editedPlayData.play_steps];
      newSteps[stepIndex] = { ...newSteps[stepIndex], [field]: value };
      setEditedPlayData({ ...editedPlayData, play_steps: newSteps });
    }
  };

  if (loadingPlays) {
    return <div className="p-4">Loading plays...</div>;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Play List */}
      <div className="col-span-1 border rounded-lg p-4 max-h-[600px] overflow-y-auto">
        <h3 className="font-semibold mb-3">Select Play to Edit</h3>
        <div className="space-y-2">
          {plays?.map((play) => (
            <button
              key={play.id}
              onClick={() => {
                setSelectedPlay(play.id);
                setEditingPlayId(null);
                setEditedPlayData(null);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                selectedPlay === play.id
                  ? "bg-blue-100 border-blue-500 border-2"
                  : "bg-gray-50 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <div className="font-medium text-sm">{play.name}</div>
              <div className="text-xs text-gray-500 mt-1">
                {play.output_type} {play.category && `• ${play.category}`}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Play Detail */}
      <div className="col-span-2 border rounded-lg p-4 max-h-[600px] overflow-y-auto">
        {!playDetail && (
          <div className="text-center text-gray-500 py-12">
            Select a play to view and edit
          </div>
        )}

        {playDetail && !editingPlayId && (
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold">{playDetail.name}</h3>
                <p className="text-sm text-gray-600">
                  {playDetail.output_type} • {playDetail.play_steps.length} step(s)
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClone}
                  disabled={clonePlayMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Copy size={20} />
                  Clone
                </button>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Pencil size={20} />
                  Edit Play
                </button>
              </div>
            </div>

            {/* Variable Analysis */}
            {playDetail.variable_analysis && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-semibold mb-2">Variable Analysis</h4>
                <div className="text-sm space-y-1">
                  <div>
                    <span className="font-medium">Total variables used:</span>{' '}
                    {playDetail.variable_analysis.all_variables.length}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {playDetail.variable_analysis.all_variables.map((v) => (
                      <code key={v} className="text-xs bg-white px-2 py-1 rounded border">
                        {`{${v}}`}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Validation Status */}
            {playDetail.validation && (
              <div className={`mb-4 p-3 rounded-lg ${
                playDetail.validation.is_valid 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <h4 className="text-sm font-semibold mb-2">
                  {playDetail.validation.is_valid ? '✓ All Variables Available' : '⚠ Missing Variables'}
                </h4>
                {playDetail.validation.missing_variables.length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium text-yellow-800">Missing: </span>
                    {playDetail.validation.missing_variables.map((v) => (
                      <code key={v} className="text-xs bg-yellow-100 px-2 py-1 rounded mx-1">
                        {`{${v}}`}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View Mode */}
            <div className="space-y-3">
              {playDetail.play_steps.map((step, idx) => (
                <div key={idx} className="border rounded-lg">
                  <button
                    onClick={() => toggleStep(idx)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg"
                  >
                    {expandedSteps.has(idx) ? <CaretDown size={20} /> : <CaretRight size={20} />}
                    <span className="font-medium">
                      Step {idx + 1}{step.name && `: ${step.name}`}
                    </span>
                  </button>
                  {expandedSteps.has(idx) && (
                    <div className="p-4 space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">System Instructions</label>
                        <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                          {step.system_instructions_template}
                        </pre>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">User Instructions</label>
                        <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                          {step.user_instructions_template}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {playDetail && editingPlayId && editedPlayData && (
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold">Editing: {playDetail.name}</h3>
                <p className="text-xs text-yellow-600 mt-1">
                  ⚠️ Be careful when editing play templates - changes affect all users
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={updatePlayMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </div>

            {/* Edit Mode */}
            <div className="space-y-4">
              {editedPlayData.play_steps.map((step, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <h4 className="font-medium mb-3">Step {idx + 1}{step.name && `: ${step.name}`}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">System Instructions</label>
                      {/* Show variables used in this step */}
                      {playDetail.variable_analysis?.step_variables?.[idx]?.variables && playDetail.variable_analysis.step_variables[idx].variables.length > 0 && (
                        <div className="text-xs text-gray-600 mb-1">
                          Variables: {playDetail.variable_analysis.step_variables[idx].variables.map(v => `{${v}}`).join(', ')}
                        </div>
                      )}
                      <textarea
                        value={step.system_instructions_template}
                        onChange={(e) => updateStepField(idx, 'system_instructions_template', e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border rounded-lg font-mono text-xs"
                        placeholder="System instructions template..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">User Instructions</label>
                      {/* Show variables used in this step */}
                      {playDetail.variable_analysis?.step_variables?.[idx]?.variables && playDetail.variable_analysis.step_variables[idx].variables.length > 0 && (
                        <div className="text-xs text-gray-600 mb-1">
                          Variables: {playDetail.variable_analysis.step_variables[idx].variables.map(v => `{${v}}`).join(', ')}
                        </div>
                      )}
                      <textarea
                        value={step.user_instructions_template}
                        onChange={(e) => updateStepField(idx, 'user_instructions_template', e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border rounded-lg font-mono text-xs"
                        placeholder="User instructions template..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
