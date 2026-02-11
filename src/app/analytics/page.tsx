"use client";
import { useState, useEffect, ReactNode } from 'react';
import { useBackendQuery } from "@/hooks/networking";
import { Play, PlayOutputType } from "@/models/play";

// Define interfaces for our data structure
interface ProcessedPlayData {
  id: number;
  name: string;
  category: string | undefined;
  type: string;
  usesLinkedIn: boolean;
  usesHubSpot: boolean;
  models: Record<string, number>;
  variablesRequired: string[];
}

export default function Analytics() {
  const [playsData, setPlaysData] = useState<ProcessedPlayData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch plays data using the same approach as in PlayEditor
  const {
    data: researchPlays = [],
    isFetching: isLoadingResearchPlays,
  } = useBackendQuery<Play[]>(`plays/?output_type=${PlayOutputType.VARIABLE}`);

  const {
    data: messagePlays = [],
    isFetching: isLoadingMessagePlays,
  } = useBackendQuery<Play[]>(`plays/?output_type=${PlayOutputType.FINAL}`);

  // Process the plays data to extract the required information
  useEffect(() => {
    if (!isLoadingResearchPlays && !isLoadingMessagePlays) {
      const processedData = [
        ...researchPlays.map(play => processPlayData(play, 'research')),
        ...messagePlays.map(play => processPlayData(play, 'message'))
      ];

      setPlaysData(processedData);
      setIsLoading(false);
    }
  }, [researchPlays, messagePlays, isLoadingResearchPlays, isLoadingMessagePlays]);

  // Process play data to extract required information
  const processPlayData = (play: Play, type: string): ProcessedPlayData => {
    // Check if play uses LinkedIn
    const usesLinkedIn = play.play_steps?.some(step =>
      (step.system_instructions_template?.includes('{linkedin') ||
       step.user_instructions_template?.includes('{linkedin')) ?? false
    ) ?? false;

    // Check if play uses HubSpot
    const usesHubSpot = play.play_steps?.some(step =>
      (step.system_instructions_template?.includes('{hubspot') ||
       step.user_instructions_template?.includes('{hubspot')) ?? false
    ) ?? false;

    // Count model usage
    const models: Record<string, number> = {};
    play.play_steps?.forEach(step => {
      if (step.model_name) {
        models[step.model_name] = (models[step.model_name] || 0) + 1;
      } else if (step.model_provider) {
        const providerKey = `${step.model_provider} (default)`;
        models[providerKey] = (models[providerKey] || 0) + 1;
      } else {
        models['default'] = (models['default'] || 0) + 1;
      }
    });

    // Extract required variables
    const variablesRequired: string[] = [];
    play.play_steps?.forEach(step => {
      const systemVars = extractVariables(step.system_instructions_template);
      const userVars = extractVariables(step.user_instructions_template);
      [...systemVars, ...userVars].forEach(variable => {
        if (!variablesRequired.includes(variable)) {
          variablesRequired.push(variable);
        }
      });
    });

    return {
      id: play.id ?? 0,
      name: play.name ?? 'Untitled Play',
      category: play.category || undefined,
      type,
      usesLinkedIn,
      usesHubSpot,
      models,
      variablesRequired,
    };
  };

  // Helper function to extract variable names from a template string
  const extractVariables = (template?: string): string[] => {
    if (!template) return [];

    const variableRegex = /\{([^{}]+)\}/g;
    const matches = template.match(variableRegex) || [];
    return matches
      .map(match => match.slice(1, -1)) // Remove { and }
      .filter(variable =>
        !variable.startsWith('prompt_') &&
        variable !== 'linkedin' &&
        variable !== 'hubspot'
      );
  };

  // Helper function to format the models usage
  const formatModelsUsage = (models: Record<string, number>): ReactNode => {
    return Object.entries(models).map(([model, count]) => (
      <div key={model} className="mb-1">
        <span className="font-medium">{model}</span>: {count}
      </div>
    ));
  };

  // Helper function to format the required variables
  const formatVariables = (variables: string[]): ReactNode => {
    return variables.map((variable, index) => (
      <span key={index} className="inline-block bg-gray-100 px-2 py-1 rounded mr-1 mb-1">
        {variable}
      </span>
    ));
  };

  return (
    <div className="outer-container w-full">
      <div className="inner-container max-w-full">
        <h1 className="text-2xl font-bold mb-6">Plays Analytics</h1>

        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <p>Loading plays data...</p>
          </div>
        ) : playsData.length === 0 ? (
          <div className="flex justify-center items-center h-40">
            <p>No plays found. Create some plays to see analytics.</p>
          </div>
        ) : (
          <div className="w-full">
            <table className="min-w-full bg-white border border-gray-200 shadow-md rounded-lg table-fixed">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider w-1/6">
                    Play Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider w-1/12">
                    Play Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider w-1/12">
                    Uses LinkedIn
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider w-1/12">
                    Uses HubSpot
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider w-1/4">
                    Models Usage
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 uppercase tracking-wider w-1/3">
                    Required Variables
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {playsData.map((play) => (
                  <tr key={play.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">{play.name}</div>
                      {play.category && (
                        <div className="text-xs text-gray-500">{play.category}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        play.type === 'research' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {play.type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {play.usesLinkedIn ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-red-600">No</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {play.usesHubSpot ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-red-600">No</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {formatModelsUsage(play.models)}
                    </td>
                    <td className="px-4 py-4">
                      {formatVariables(play.variablesRequired)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}