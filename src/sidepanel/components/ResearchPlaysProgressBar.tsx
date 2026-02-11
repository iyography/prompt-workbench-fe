import React, { useRef } from 'react';

interface ResearchPlaysProgressBarProps {
  totalResearchPlays: number;
  completedResearchPlays: number;
}

export function ResearchPlaysProgressBar({ 
  totalResearchPlays, 
  completedResearchPlays 
}: ResearchPlaysProgressBarProps) {
  const DISPLAY_TOTAL = 55; // Hardcoded display reference (from main)
  const maxPercentRef = useRef(0);
  
  // Calculate raw percentage
  const rawPercent = totalResearchPlays > 0
    ? Math.round((completedResearchPlays / totalResearchPlays) * 100)
    : 0;
  
  // Clamp to 0-100 range
  const clampedPercent = Math.min(100, Math.max(0, rawPercent));
  
  // Ensure 100% when all completable plays are done
  const percentComplete = completedResearchPlays >= totalResearchPlays && totalResearchPlays > 0
    ? 100
    : clampedPercent;
  
  // Update max percent seen (prevent visual decrease)
  if (percentComplete > maxPercentRef.current) {
    maxPercentRef.current = percentComplete;
  }
  
  // Use max percent for display (never decrease visually)
  const displayPercent = maxPercentRef.current;

  return (
    <div className="mt-2 mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">
          {displayPercent}% [{DISPLAY_TOTAL} total]
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${
            completedResearchPlays >= totalResearchPlays && totalResearchPlays > 0 
              ? 'bg-green-700' 
              : 'bg-blue-700'
          }`}
          style={{ width: `${displayPercent}%` }}
        />
      </div>
    </div>
  );
}
