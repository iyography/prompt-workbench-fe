import { Dictionary } from "lodash";
import { Play, RunFinalPlayResponseType } from "../../models/play";

export interface PlayVariables {
  [key: string]: string;
}

export interface SmartVariablesData {
  [key: string]: string;
}

export interface CustomVariables {
  [key: string]: string;
}

export interface PlayResponse {
  [key: string]: RunFinalPlayResponseType;
}

export interface ResearchDisplayProps {
  selectedPlay: Play | undefined;
  loadingUI: boolean;
  allData: Record<string, string>;
  detectedPersonaName: string;
  filteredSmartVariables: Record<string, string>;
  rawResearchPlays: Array<{
    name: string; 
    value: string;
    status: 'ready' | 'loading' | 'complete' | 'error';
    requiredVariables: string[];
  }>;
  setCustomVariable: (key: string, value: string) => void;
  keysForPlay: (play: Play) => string[];
  linkedInProfileFromEmail?: string | null | false;
  pendingTasks: string[];
  totalTasksInitiated: number;
  totalResearchPlays: number;
  completedResearchPlays: number;
  rawCompletedResearchPlays?: number;
  completableResearchPlays: number;
  isResearchComplete?: boolean; // Flag indicating if research is complete
  apiCompletionStates: {
    companyEnrichment: boolean;
    hubspot: boolean;
    apifyContent: boolean;
    accountIntel: boolean;
  };
  dataLoadingStates: {
    companyEnrichment: boolean;
    hubspot: boolean;
    apifyContent: boolean;
    accountIntel: boolean;
  };
  showOnlyMissingFields?: boolean;
  // Debug modal props
  showDebugModal: boolean;
  setShowDebugModal: (show: boolean) => void;
  // First run state for API completion bubbles
  isFirstRun?: boolean;
  // Account intel props
  accountIntel?: string;
  companyName?: string;
  orgChartMatchType?: string;
  orgChartMatchConfidence?: number;
  accountStatus?: 'pending' | 'success' | 'failure';
  // Persona prompts for debug modal
  personaPrompts?: { system_instructions?: string; user_instructions?: string } | null;
}

export interface PlaySelectorProps {
  plays: Play[];
  selectedPlay: Play | undefined;
  setSelectedPlay: (play: Play | undefined) => void;
  isPlayAbleToRunWithoutCustomVars: (play: Play) => boolean;
  loading: boolean;
  runPlay: (numOutputsOverride?: number) => void;
}

export interface ResearchButtonsProps {
  loadingUI: boolean;
  currentUsername: string | undefined;
  fetchLinkedInProfileData: (data: { profile_id: string }) => void;
  autoRun: boolean;
  setAutoRun: (value: boolean) => void;
  refreshCRMData: () => void;
  stopResearch: () => void;
}