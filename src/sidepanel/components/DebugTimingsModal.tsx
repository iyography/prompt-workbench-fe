import React from 'react';
import { BaseModal } from '@/components/modals/BaseModal';
import ApiTiming from './ApiTiming';

interface DebugTimingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  timingJson?: string;
  rawResearchPlays: any[];
  allData: Record<string, string>;
  pendingTasks: string[];
  personaPrompts?: { system_instructions?: string; user_instructions?: string } | null;
  hasResearchBeenInitiated?: boolean;
}

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

export function DebugTimingsModal({ 
  isOpen, 
  onClose, 
  timingJson, 
  rawResearchPlays, 
  allData, 
  pendingTasks,
  personaPrompts,
  hasResearchBeenInitiated = false
}: DebugTimingsModalProps) {
  return (
    <BaseModal show={isOpen} onClose={onClose}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Debug Information</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="max-h-96 overflow-y-auto space-y-6">
          {/* API Performance Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <h3 className="text-sm font-semibold text-gray-700">API Performance</h3>
            </div>
            {timingJson ? (
              <ApiTiming timingJson={timingJson} />
            ) : (
              <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg text-center">
                No timing data available yet. Click "Research Prospect" to start collecting timing data.
              </div>
            )}
          </div>

          {/* Research Play Performance Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <h3 className="text-sm font-semibold text-gray-700">Research Play Performance</h3>
            </div>
            {rawResearchPlays.length > 0 ? (
              <ResearchPlaysTiming
                rawResearchPlays={rawResearchPlays}
                allData={allData}
                pendingTasks={pendingTasks}
              />
            ) : (
              <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg text-center">
                No research plays have been executed yet.
              </div>
            )}
          </div>

          {/* Persona Detection Prompt Section */}
          {/* Show if personaPrompts exists OR if research has been initiated (to show placeholder) */}
          {(personaPrompts || hasResearchBeenInitiated) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <h3 className="text-sm font-semibold text-gray-700">Persona Detection Prompt</h3>
              </div>
              {personaPrompts ? (
                <div className="space-y-4">
                  {personaPrompts.system_instructions && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-600 mb-2">System Instructions</h4>
                      <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                        {personaPrompts.system_instructions}
                      </pre>
                    </div>
                  )}
                  {personaPrompts.user_instructions && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-600 mb-2">User Instructions</h4>
                      <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                        {personaPrompts.user_instructions}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg text-center">
                  Persona prompts will appear after research is completed.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
