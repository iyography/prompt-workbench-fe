import { LoadingIndicator } from "../../components/smart/GetLinkedInData";
import { ResearchDisplayProps } from "../types/execute-view.types";
import {AutogrowTextArea} from "@/components/common/AutogrowTextArea";
import React from 'react'
import {ProgressBar} from "@/sidepanel/components/ProgressBar";
import {formatString} from "@/utils/string-interpolation";
import { ResearchPlaysProgressBar } from "./ResearchPlaysProgressBar";
import { ApiStatusIndicators } from "./ApiStatusIndicators";
import { AccountIntelButton } from "./AccountIntelButton";
import { DebugTimingsModal } from "./DebugTimingsModal";
import { normalizeMarkdownHeaders } from "@/utils/markdown-normalize";
import ApiTiming from "./ApiTiming";

// Lightweight, in-file timing tracker for research plays
function ResearchPlaysTiming({ rawResearchPlays, allData, pendingTasks }: { rawResearchPlays: any[]; allData: Record<string, string>; pendingTasks: string[] }) {
  // Anchor start from hook timing (performance.now base)
  const startedAt = React.useMemo(() => {
    try { return JSON.parse(allData.timing_json || '{}').startedAt as number | undefined } catch { return undefined }
  }, [allData.timing_json])

  // ref to store first-occurrence timestamps per play
  const timesRef = React.useRef<Record<string, { requiredCount: number; varsReadyAt?: number; sentAt?: number; completedAt?: number; completedWallAt?: string }>>({})
  const [, force] = React.useState(0)

  // Update required counts and mark events
  React.useEffect(() => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const ensure = (name: string, requiredCount: number) => {
      if (!timesRef.current[name]) timesRef.current[name] = { requiredCount }
      else timesRef.current[name].requiredCount = requiredCount
    }

    rawResearchPlays.forEach(p => {
      ensure(p.name, (p.requiredVariables || []).length)

      // vars ready: all required vars present in allData (non-empty)
      if (startedAt && (p.requiredVariables || []).length > 0 && !timesRef.current[p.name].varsReadyAt) {
        const allPresent = (p.requiredVariables || []).every((k: string) => {
          const v = allData[k]
          return typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'nothing'
        })
        if (allPresent) {
          timesRef.current[p.name].varsReadyAt = now
          force(x => x + 1)
        }
      }

      // sent to LLM: appears in pendingTasks
      if (startedAt && pendingTasks.includes(p.name) && !timesRef.current[p.name].sentAt) {
        timesRef.current[p.name].sentAt = now
        force(x => x + 1)
      }

      // completed: status complete (only for successful completions)
      if (startedAt && p.status === 'complete' && !timesRef.current[p.name].completedAt) {
        timesRef.current[p.name].completedAt = now
        timesRef.current[p.name].completedWallAt = new Date().toLocaleTimeString()
        force(x => x + 1)
      }
      
      // error: status error (don't record completion time for errors)
      if (startedAt && p.status === 'error' && !timesRef.current[p.name].completedAt) {
        timesRef.current[p.name].completedAt = undefined // Don't record completion for errors
        timesRef.current[p.name].completedWallAt = 'ERROR'
        force(x => x + 1)
      }
    })
  }, [rawResearchPlays, allData, pendingTasks, startedAt])

   const rows = rawResearchPlays.map(p => {
     const t = timesRef.current[p.name] || { requiredCount: (p.requiredVariables || []).length }
     const delta = (x?: number) => (startedAt != null && x != null ? Math.max(0, Math.round(x - startedAt)) : undefined)
     const llmCallMs = t.sentAt && t.completedAt ? Math.max(0, Math.round(t.completedAt - t.sentAt)) : undefined
     const totalMs = t.completedAt && startedAt ? Math.max(0, Math.round(t.completedAt - startedAt)) : undefined
     
     return {
       name: p.name,
       required: t.requiredCount || 0,
       varsReadyMs: delta(t.varsReadyAt),
       sentMs: delta(t.sentAt),
       llmCallMs: llmCallMs,
       totalMs: totalMs,
       completedAt: t.completedWallAt,
     }
   })

  if (!startedAt) return null as any

  return (
    <div className="mb-2">
      <h3 className="text-sm font-semibold mb-2">Research Plays Timing</h3>
      <div className="space-y-2">
        {rows.map(r => {
          const play = rawResearchPlays.find(p => p.name === r.name);
          const isError = play?.status === 'error';
          const isComplete = play?.status === 'complete';
          
          return (
            <div key={r.name} className={`border rounded-lg p-2 ${
              isError ? 'border-red-300 bg-red-50' : 
              isComplete ? 'border-green-300 bg-green-50' : 
              'border-gray-200'
            }`}>
              {/* Play name above the data */}
              <div className={`font-semibold text-sm mb-1 text-center ${
                isError ? 'text-red-800' : 
                isComplete ? 'text-green-800' : 
                'text-gray-800'
              }`}>
                {r.name}
                {isError && ' (ERROR)'}
                {isComplete && ' (✓)'}
              </div>
              
              {/* Data row with all timing metrics */}
              <div className="flex justify-between gap-2 text-xs">
                <span className="w-20 text-right">req: {r.required}</span>
                <span className="w-28 text-right">vars: {r.varsReadyMs != null ? `${(r.varsReadyMs/1000).toFixed(2)}s` : '—'}</span>
                <span className="w-28 text-right">sent: {r.sentMs != null ? `${(r.sentMs/1000).toFixed(2)}s` : '—'}</span>
                <span className="w-32 text-right">LLM call: {r.llmCallMs != null ? `${(r.llmCallMs/1000).toFixed(2)}s` : '—'}</span>
                <span className="w-28 text-right">total: {r.totalMs != null ? `${(r.totalMs/1000).toFixed(2)}s` : '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}

export function ResearchDisplay({
  selectedPlay,
  loadingUI,
  allData,
  detectedPersonaName,
  filteredSmartVariables,
  rawResearchPlays,
  linkedInProfileFromEmail,
  setCustomVariable,
  keysForPlay,
  pendingTasks,
  totalTasksInitiated,
  totalResearchPlays,
  completedResearchPlays,
  completableResearchPlays,
  apiCompletionStates,
  dataLoadingStates,
  showOnlyMissingFields = false,
  showDebugModal,
  setShowDebugModal,
  isFirstRun = false,
  accountIntel,
  companyName,
  orgChartMatchType,
  orgChartMatchConfidence,
  personaPrompts,
}: ResearchDisplayProps) {
  const researchToDisplay = () => {
    const ret: Record<string, string> = {};
    if (!selectedPlay) {
      // Only show successfully completed research plays (not raw data or loading states)
      const completedResearch: Record<string, string> = {};
      
      // Add completed research play results
      rawResearchPlays.forEach(play => {
        const v = (play.value || '').trim();
        const isNothing = v.toLowerCase() === 'nothing';
        if (play.status === 'complete' && v !== '' && !isNothing) {
          completedResearch[play.name] = play.value;
        }
      });
      
      // If we have completed research, show those results
      if (Object.keys(completedResearch).length > 0) {
        // Process template variables (those with {variable?} patterns)
        const processedData: Record<string, string> = {};
        Object.entries(completedResearch).forEach(([key, value]) => {
          let processedValue = value;
          if (typeof value === 'string' && value.includes('{') && value.includes('}')) {
            // This looks like a template string, process it
            try {
              const { formattedString } = formatString(value, {...allData, ...completedResearch});
              processedValue = formattedString;
            } catch {
              // If formatting fails, keep the original value
              processedValue = value;
            }
          }
          // Normalize markdown headers for consistent display
          if (typeof processedValue === 'string') {
            processedValue = normalizeMarkdownHeaders(processedValue);
          }
          processedData[key] = processedValue;
        });
        return processedData;
      } else {
        // Do not show underlying contextual data before first research result
        return {};
      }
    } else {
      const keys = keysForPlay(selectedPlay);
      keys.forEach((key) => {
        const value = allData[key];
        // Normalize markdown headers for consistent display
        if (typeof value === 'string') {
          ret[key] = normalizeMarkdownHeaders(value);
        } else {
          ret[key] = value;
        }
      });
      return ret;
    }
  };

  const hasMissingFields = selectedPlay &&
    !loadingUI &&
    Object.values(researchToDisplay()).some((value) => !value);

  // Check if research has been completed
  const hasResearchBeenCompleted = totalTasksInitiated > 0 && pendingTasks.length === 0 && !loadingUI;
  // Check if research has been initiated (for showing Detected Persona)
  const hasResearchBeenInitiated = totalTasksInitiated > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1 gap-2">
        <h2>Research</h2>
        {!showOnlyMissingFields && (
          <AccountIntelButton
            accountIntel={accountIntel}
            companyName={companyName}
            matchType={orgChartMatchType}
            confidence={orgChartMatchConfidence}
          />
        )}
      </div>
      {/* Show LinkedIn profile found via email banner */}
          {linkedInProfileFromEmail && (
            <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0 text-blue-600 mr-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-sm text-blue-800">
                  LinkedIn profile found via email lookup: <a href={linkedInProfileFromEmail} target="_blank" rel="noopener noreferrer" className="font-medium underline">View Profile</a>
                </p>
              </div>
            </div>
          )}

          {/* Show LinkedIn profile not found via email banner */}
          {linkedInProfileFromEmail === false && (
            <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0 text-blue-600 mr-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-sm text-blue-800">
                  No LinkedIn profile found for the email address
                </p>
              </div>
            </div>
          )}

      <div className="h-5 flex items-center">
        {loadingUI ? (
          <LoadingIndicator message="Gathering research..." />
        ) : (
          // Only show "Research Complete" if research has been initiated and completed
          hasResearchBeenCompleted && (
            <div className="flex items-center gap-2 text-green-700">
              <span>✓</span>
              <span>Research Complete</span>
            </div>
          )
        )}
      </div>
       {!showOnlyMissingFields && (
         <>
           {/* Research Plays Progress Bar */}
           <ResearchPlaysProgressBar 
             totalResearchPlays={completableResearchPlays}
             completedResearchPlays={completedResearchPlays}
           />

           {/* API Status Indicators */}
           <div className="mt-2 p-3 border rounded-lg bg-gray-50">
             <div className="flex items-start gap-4">
               <ApiStatusIndicators 
                 completionStates={apiCompletionStates} 
                 loadingStates={dataLoadingStates}
                 isFirstRun={isFirstRun}
               />
               {/* Information button - aligned with indicator headers */}
               <button 
                 onClick={() => setShowDebugModal(true)}
                 className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all duration-200"
                 title="View debug information"
                 aria-label="View debug information"
               >
                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                   <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                 </svg>
               </button>
             </div>
           </div>

           {/* API Performance Display */}
          {allData.timing_json && (
            <div className="mt-2">
              <ApiTiming timingJson={allData.timing_json} />
            </div>
          )}

          {/* Research Plays Timing Display */}
          {rawResearchPlays.length > 0 && totalTasksInitiated > 0 && (
            <div className="mt-2">
              <ResearchPlaysTiming
                rawResearchPlays={rawResearchPlays}
                allData={allData}
                pendingTasks={pendingTasks}
              />
            </div>
          )}
         </>
       )}

      {hasMissingFields && (
        <span className="text-red-700 p-2 px-4 rounded bg-red-50">
          Please complete required fields before executing
        </span>
      )}
      {(() => {
        // Build play variables list
        const playVars = [
          // Only include "Detected Persona" if research has been initiated
          ...(hasResearchBeenInitiated ? [["__detected_persona_special", detectedPersonaName]] : []),
          ...Object.entries(researchToDisplay())
            .filter(([key]) => {
              // Hide unwanted raw data fields from UI
              const hideRawFields = [
                'account_intel',
                'active_experience_title',
                'company_enrichment_company_name',
                'company_enrichment_description',
                'company_enrichment_guaranteed',
                'company_enrichment_industry',
                'company_enrichment_website',
                'company_research',
                'first_name',
                'first_name_initial',
                'full_name',
                'hubspot_company_match_status',
                'job_title',
                'last_name',
                'last_name_initial',
                'linkedin_company_data',
                'linkedin_shorthand_names',
                'my_name',
                'org_chart_company_name',
                'org_chart_confidence',
                'org_chart_match_type',
                'org_chart_matched',
                'our_company',
                'persona_names'
              ];
              return !hideRawFields.includes(key);
            })
            .sort(([a], [b]) => a.localeCompare(b))
            .sort(
              ([a], [b]) =>
                (Boolean(allData[b]) ? -1 : 0) - (Boolean(allData[a]) ? -1 : 0),
            ),
        ];

        // Account intel is now only accessible via the green AccountIntelButton
        // No longer shown in the main research display

        return playVars.map(([key, value]) => {
        const name = key === "__detected_persona_special" ? "Detected Persona" : key.split("_").join(" ");
        const isEmpty = !value || (typeof value === 'string' && value.trim().toLowerCase() === 'nothing');
        const showMissingIndicator = isEmpty && !loadingUI && selectedPlay;

        return (
          <div key={key}>
            <div className="flex items-center gap-2">
              <p className="font-bold capitalize">{name}</p>
              {showMissingIndicator && (
                <span className="text-xs text-red-600 font-medium">• variable missing</span>
              )}
            </div>
             {!value && loadingUI && !showOnlyMissingFields ? (
               <div className="w-full px-3 py-1.5 h-5 mt-2 border-0 animate-pulse bg-slate-200 rounded-lg"></div>
             ) : (
               <AutogrowTextArea
                 className={`w-[calc(100%+24px)] px-3 py-1.5 -mx-3 h-5 text-sm resize-none no-scrollbar rounded-lg ${
                   showMissingIndicator
                     ? "border border-red-500" 
                     : "border-0"
                 }`}
                 value={isEmpty ? '' : value}
                 placeholder={
                   loadingUI && !showOnlyMissingFields ? "Loading..." : "⛔️ Add a value to run play"
                 }
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setCustomVariable(key, e.target.value);
                }}
                renderMarkdown={true}
              />
            )}
          </div>
        );
        });
      })()}

      {/* Debug Modal */}
      <DebugTimingsModal
        isOpen={showDebugModal}
        onClose={() => setShowDebugModal(false)}
        timingJson={allData.timing_json}
        rawResearchPlays={rawResearchPlays}
        allData={allData}
        pendingTasks={pendingTasks}
        personaPrompts={personaPrompts}
        hasResearchBeenInitiated={totalTasksInitiated > 0}
      />
    </div>
  );
}
