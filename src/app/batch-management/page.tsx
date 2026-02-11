"use client";

import React, { useState, useEffect } from 'react';
import { useBackendQuery, useBackendMutation } from '@/hooks/networking';
import { Play, PlayOutputType } from '@/models/play';

const BATCH_DEFINITIONS = [
  { id: 1, name: 'LinkedIn Profile', color: 'bg-blue-500', description: 'Core LinkedIn profile information' },
  { id: 2, name: 'Company Enrichment', color: 'bg-green-500', description: 'Company data from CoreSignal' },
  { id: 3, name: 'HubSpot Data', color: 'bg-orange-500', description: 'CRM contact and company data' },
  { id: 4, name: 'LinkedIn Posts', color: 'bg-purple-500', description: 'Recent LinkedIn activity' },
  { id: 5, name: 'LinkedIn Jobs', color: 'bg-indigo-500', description: 'Job listings from company' }
];

interface PlayBatchMapping {
  play_id: number;
  required_batches: number[];
}

export default function BatchManagement() {
  const [playBatchMappings, setPlayBatchMappings] = useState<Record<number, number[]>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Get all plays
  const { 
    data: finalOutputPlays = [], 
    isLoading: isLoadingPlays,
    error: errorPlays 
  } = useBackendQuery<Play[]>(`plays/?output_type=${PlayOutputType.FINAL}`);

  // Real API calls for batch mappings
  const { 
    data: existingMappings,
    isLoading: isLoadingMappings,
    refetch: refetchMappings
  } = useBackendQuery<PlayBatchMapping[]>('play-batch-mappings/', {
    enabled: true // Enable real API endpoint
  });

  const { 
    mutateAsync: saveBatchMapping,
    isPending: isSaving 
  } = useBackendMutation<PlayBatchMapping, any>('play-batch-mappings/update/', 'POST');

  // Initialize mappings from existing data or empty
  useEffect(() => {
    if (existingMappings) {
      const mappingsObj = existingMappings.reduce((acc, mapping) => {
        acc[mapping.play_id] = mapping.required_batches;
        return acc;
      }, {} as Record<number, number[]>);
      setPlayBatchMappings(mappingsObj);
    } else {
      // Initialize with empty arrays for all plays
      const initialMappings = finalOutputPlays.reduce((acc, play) => {
        acc[play.id] = [];
        return acc;
      }, {} as Record<number, number[]>);
      setPlayBatchMappings(initialMappings);
    }
  }, [existingMappings, finalOutputPlays]);

  // Auto-detect batch requirements based on play content
  const autoDetectBatches = (play: Play): number[] => {
    const requiredBatches: number[] = [];
    const playStepsText = play.play_steps.map(step => 
      (step.system_instructions_template || '') + (step.user_instructions_template || '')
    ).join(' ').toLowerCase();

    // Batch 1: LinkedIn Profile
    if (playStepsText.includes('linkedin_') || playStepsText.includes('first_name') || 
        playStepsText.includes('last_name') || playStepsText.includes('headline')) {
      requiredBatches.push(1);
    }

    // Batch 2: Company Enrichment
    if (playStepsText.includes('company_enrichment_') || playStepsText.includes('company_name') || 
        playStepsText.includes('company_industry') || playStepsText.includes('website') ||
        playStepsText.includes('description')) {
      requiredBatches.push(2);
    }

    // Batch 3: HubSpot
    if (playStepsText.includes('hubspot_')) {
      requiredBatches.push(3);
    }

    // Batch 4: LinkedIn Posts
    if (playStepsText.includes('linkedin_post') || playStepsText.includes('post_')) {
      requiredBatches.push(4);
    }

    // Batch 5: LinkedIn Jobs
    if (playStepsText.includes('linkedin_job') || playStepsText.includes('job_')) {
      requiredBatches.push(5);
    }

    return requiredBatches;
  };

  const toggleBatchForPlay = (playId: number, batchId: number) => {
    setPlayBatchMappings(prev => {
      const currentBatches = prev[playId] || [];
      const newBatches = currentBatches.includes(batchId)
        ? currentBatches.filter(id => id !== batchId)
        : [...currentBatches, batchId].sort();
      
      const newMappings = {
        ...prev,
        [playId]: newBatches
      };
      
      setHasUnsavedChanges(true);
      return newMappings;
    });
  };

  const autoDetectAllBatches = () => {
    const newMappings = finalOutputPlays.reduce((acc, play) => {
      acc[play.id] = autoDetectBatches(play);
      return acc;
    }, {} as Record<number, number[]>);
    
    setPlayBatchMappings(newMappings);
    setHasUnsavedChanges(true);
  };

  const saveAllMappings = async () => {
    try {
      // Save to backend API
      await Promise.all(
        Object.entries(playBatchMappings).map(([playId, batches]) =>
          saveBatchMapping({ play_id: parseInt(playId), required_batches: batches })
        )
      );
      
      // Refresh mappings from server
      await refetchMappings();
      
      setHasUnsavedChanges(false);
      alert('Batch mappings saved successfully!');
    } catch (error) {
      console.error('Failed to save batch mappings:', error);
      alert('Failed to save batch mappings. Please try again.');
    }
  };

  // No longer needed - using real API

  if (isLoadingPlays) {
    return <div className="p-container">Loading plays...</div>;
  }

  if (errorPlays) {
    return <div className="p-container error">⛔️ Error loading plays: {errorPlays.message}</div>;
  }

  return (
    <div className="w-full h-full p-container flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Batch Management</h1>
        <p className="text-gray-600">
          Map plays to the data batches they require. This ensures proper data loading order in both the workbench and extension.
        </p>
      </div>

      {/* Batch Legend */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h2 className="font-semibold mb-3">Available Data Batches</h2>
        <div className="flex flex-wrap gap-3">
          {BATCH_DEFINITIONS.map(batch => (
            <div key={batch.id} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded ${batch.color} text-white text-xs font-bold flex items-center justify-center`}>
                {batch.id}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{batch.name}</span>
                <span className="text-xs text-gray-500">{batch.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-4 items-center">
        <button
          onClick={autoDetectAllBatches}
          className="btn-secondary"
          disabled={finalOutputPlays.length === 0}
        >
          🔍 Auto-detect All Batches
        </button>
        
        <button
          onClick={saveAllMappings}
          className="btn-primary"
          disabled={!hasUnsavedChanges || isSaving}
        >
          {isSaving ? 'Saving...' : '💾 Save All Mappings'}
        </button>

        {hasUnsavedChanges && (
          <span className="text-orange-600 text-sm">⚠️ You have unsaved changes</span>
        )}
      </div>

      {/* Play Mappings Table */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="font-semibold">Play Batch Requirements</h2>
          <p className="text-sm text-gray-600">Click batch numbers to toggle requirements for each play</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 font-medium">Play Name</th>
                <th className="text-center p-4 font-medium">Required Batches</th>
                <th className="text-center p-4 font-medium">Auto-detected</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {finalOutputPlays.map(play => {
                const currentBatches = playBatchMappings[play.id] || [];
                const autoDetected = autoDetectBatches(play);
                const isAutoDetectedDifferent = JSON.stringify(currentBatches.sort()) !== JSON.stringify(autoDetected.sort());
                
                return (
                  <tr key={play.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-medium">{play.name}</span>
                        <span className="text-xs text-gray-500">ID: {play.id}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-2">
                        {BATCH_DEFINITIONS.map(batch => {
                          const isSelected = currentBatches.includes(batch.id);
                          return (
                            <button
                              key={batch.id}
                              onClick={() => toggleBatchForPlay(play.id, batch.id)}
                              className={`
                                w-8 h-8 rounded-full text-xs font-bold transition-all duration-200
                                ${isSelected 
                                  ? `${batch.color} text-white shadow-md` 
                                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                }
                              `}
                              title={`${batch.name} - ${isSelected ? 'Required' : 'Not required'}`}
                            >
                              {batch.id}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-1">
                        {autoDetected.map(batchId => (
                          <span
                            key={batchId}
                            className={`
                              w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center
                              ${BATCH_DEFINITIONS.find(b => b.id === batchId)?.color} text-white
                            `}
                          >
                            {batchId}
                          </span>
                        ))}
                        {autoDetected.length === 0 && (
                          <span className="text-xs text-gray-400">None detected</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => {
                          setPlayBatchMappings(prev => ({
                            ...prev,
                            [play.id]: autoDetected
                          }));
                          setHasUnsavedChanges(true);
                        }}
                        className={`
                          text-xs px-2 py-1 rounded transition-colors
                          ${isAutoDetectedDifferent 
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                            : 'bg-gray-100 text-gray-500'
                          }
                        `}
                        disabled={!isAutoDetectedDifferent}
                      >
                        Use Auto-detect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
        <div className="text-sm text-blue-800">
          <p>• Total plays: {finalOutputPlays.length}</p>
          <p>• Plays with batch requirements: {Object.values(playBatchMappings).filter(batches => batches.length > 0).length}</p>
          <p>• Average batches per play: {(Object.values(playBatchMappings).reduce((sum, batches) => sum + batches.length, 0) / finalOutputPlays.length).toFixed(1)}</p>
        </div>
      </div>
    </div>
  );
}