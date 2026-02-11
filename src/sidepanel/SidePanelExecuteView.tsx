import "@/app/globals.css";

import { useExecuteView } from "./hooks/useExecuteView";
import { ResearchButtons } from "./components/ResearchButtons";
import { PlaySelector } from "./components/PlaySelector";
import { ResearchDisplay } from "./components/ResearchDisplay";
import { PlayResults } from "./components/PlayResults";
import { LoadingWheel } from "../components/chrome/LoadingWheel";
import { BackgroundGradient } from "../components/chrome/BackgroundGradient";
import {
  isHubSpotContactPage,
  isSalesNavigatorProfile,
} from "@/utils/linkedin";
import { useActiveTabUrl } from "@/hooks/chrome";
import { useBackendQuery } from "@/hooks/networking";
import React from "react";

function SidePanelExecuteView() {
  const {
    selectedPlay,
    setSelectedPlay,
    playResponses,
    autoRun,
    setAutoRun,
    currentUsername,
    fetchLinkedInProfileData,
    plays,
    detectedPersonaName,
    allData,
    isPlayAbleToRunWithoutCustomVars,
    keysForPlay,
    runPlay,
    setCustomVariable,
    refreshCRMData,
    stopResearch,
    loading,
    loadingUI,
    error,
    runError,
    isLoadingRun,
    filteredSmartVariables,
    rawResearchPlays,
    profile,
    linkedInProfileFromEmail,
    pendingTasks,
    totalTasksInitiated,
    totalResearchPlays,
    completedResearchPlays,
    completableResearchPlays,
    apiCompletionStates,
    dataLoadingStates,
    showDebugModal,
    setShowDebugModal,
    isFirstRun,
    accountIntel,
    companyName,
    orgChartMatchType,
    orgChartMatchConfidence,
    personaPrompts,
  } = useExecuteView();

  const url = useActiveTabUrl();

  // Credit badge query
  const { data: tokenInfo, error: tokenInfoError, isLoading: isLoadingTokenInfo } = useBackendQuery<{ balance: number }>(
    "token-info/",
    "GET",
    { 
      shouldCacheResponse: false,
      enabled: true, // Explicitly enable the query
      retry: 1, // Retry once on failure
    }
  );
  
  // Debug logging (can be removed after fixing)
  React.useEffect(() => {
    if (tokenInfoError) {
      console.error("Token info query error:", tokenInfoError);
    }
  }, [tokenInfo, tokenInfoError]);

  if (
    (!currentUsername || !(loadingUI || profile)) &&
    !isSalesNavigatorProfile(url) &&
    !isHubSpotContactPage(url)
  ) {
    return (
      <div className="p-4 h-full">
        <div className="w-full h-full fixed top-0 left-0 -z-10">
          <BackgroundGradient />
        </div>
        <p className="card my-4">
          Please navigate to a LinkedIn Profile
          <br />
          or Hubspot Contact to begin.
        </p>
      </div>
    );
  }

  if (isLoadingRun) {
    return (
      <div className="p-4 h-full">
        <div className="w-full h-full fixed top-0 left-0 -z-10">
          <BackgroundGradient />
        </div>
        <LoadingWheel step="creative" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 h-full">
        <div className="w-full h-full fixed top-0 left-0 -z-10">
          <BackgroundGradient />
        </div>
        <p className="error card my-4">⛔️ {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full">
      <div className="w-full h-full fixed top-0 left-0 -z-10">
        <BackgroundGradient />
      </div>
      <div className="w-full h-[97%] bg-white rounded-xl mt-4">
        <div className="w-full h-full opacity-fade-out-bottom">
          <div className="w-full h-full p-6 flex flex-col gap-4 overflow-y-scroll auto">
            {/* Credit badge at the top */}
            <div className="flex justify-end mb-2">
              {isLoadingTokenInfo ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  Loading...
                </span>
              ) : tokenInfoError ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  Credits unavailable
                </span>
              ) : tokenInfo ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {tokenInfo.balance.toFixed(1)} credits
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 items-start w-full">
              <ResearchButtons
                loadingUI={loadingUI}
                currentUsername={currentUsername}
                fetchLinkedInProfileData={fetchLinkedInProfileData}
                autoRun={autoRun}
                setAutoRun={setAutoRun}
                refreshCRMData={refreshCRMData}
                stopResearch={stopResearch}
              />
              <PlaySelector
                runPlay={runPlay}
                plays={plays}
                selectedPlay={selectedPlay}
                setSelectedPlay={setSelectedPlay}
                isPlayAbleToRunWithoutCustomVars={
                  isPlayAbleToRunWithoutCustomVars
                }
                loading={loading}
              />
            </div>
            {playResponses[selectedPlay?.id || ""] && selectedPlay ? (
              <PlayResults
                selectedPlay={selectedPlay}
                playResponses={playResponses}
                onBack={() => setSelectedPlay(undefined)}
                runPlay={runPlay}
                runError={runError || null}
              />
            ) : selectedPlay && !isPlayAbleToRunWithoutCustomVars(selectedPlay) ? (
              // Show only missing fields for red plays
              <div className="flex flex-col gap-4">
                {/* Header with back button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedPlay(undefined)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Back to Research
                  </button>
                  <h2 className="text-lg font-semibold">Complete Required Fields</h2>
                </div>

                {/* Play name */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Play:</span> {selectedPlay.name}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Fill out the missing fields below to enable this play
                  </p>
                </div>

                {/* Missing fields only */}
                <ResearchDisplay
                  selectedPlay={selectedPlay}
                  loadingUI={loadingUI}
                  allData={allData}
                  detectedPersonaName={detectedPersonaName}
                  filteredSmartVariables={filteredSmartVariables}
                  rawResearchPlays={rawResearchPlays}
                  setCustomVariable={setCustomVariable}
                  keysForPlay={keysForPlay}
                  linkedInProfileFromEmail={linkedInProfileFromEmail}
                  pendingTasks={pendingTasks}
                  totalTasksInitiated={totalTasksInitiated}
                  totalResearchPlays={totalResearchPlays}
                  completedResearchPlays={completedResearchPlays}
                  completableResearchPlays={completableResearchPlays}
                  apiCompletionStates={apiCompletionStates}
                  dataLoadingStates={dataLoadingStates}
                  showOnlyMissingFields={true}
                  showDebugModal={showDebugModal}
                  setShowDebugModal={setShowDebugModal}
                  isFirstRun={isFirstRun}
                />
                
                {/* Show Run Play button when fields are completed */}
                {selectedPlay && isPlayAbleToRunWithoutCustomVars(selectedPlay) && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 mb-3">
                      ✅ All required fields are now complete! This play is ready to run.
                    </p>
                    <button
                      onClick={() => runPlay()}
                      className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                    >
                      ▶️ Run {selectedPlay.name}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ResearchDisplay
                selectedPlay={selectedPlay}
                loadingUI={loadingUI}
                allData={allData}
                detectedPersonaName={detectedPersonaName}
                filteredSmartVariables={filteredSmartVariables}
                rawResearchPlays={rawResearchPlays}
                setCustomVariable={setCustomVariable}
                keysForPlay={keysForPlay}
                linkedInProfileFromEmail={linkedInProfileFromEmail}
                pendingTasks={pendingTasks}
                totalTasksInitiated={totalTasksInitiated}
                totalResearchPlays={totalResearchPlays}
                completedResearchPlays={completedResearchPlays}
                completableResearchPlays={completableResearchPlays}
                apiCompletionStates={apiCompletionStates}
                dataLoadingStates={dataLoadingStates}
                showDebugModal={showDebugModal}
                setShowDebugModal={setShowDebugModal}
                isFirstRun={isFirstRun}
                accountIntel={accountIntel}
                companyName={companyName}
                orgChartMatchType={orgChartMatchType}
                orgChartMatchConfidence={orgChartMatchConfidence}
                personaPrompts={personaPrompts}
              />
            )}
            <div className="min-h-10 w-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SidePanelExecuteView;
