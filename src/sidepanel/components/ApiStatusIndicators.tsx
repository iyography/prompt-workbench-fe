import React from 'react';

interface ApiStatusIndicatorsProps {
  completionStates: {
    companyEnrichment: boolean;
    hubspot: boolean;
    apifyContent: boolean;
    accountIntel: boolean;
  };
  loadingStates: {
    companyEnrichment: boolean;
    hubspot: boolean;
    apifyContent: boolean;
    accountIntel: boolean;
  };
  isFirstRun?: boolean;
  accountStatus?: 'pending' | 'success' | 'failure';
}

export function ApiStatusIndicators({ completionStates, loadingStates, isFirstRun = false, accountStatus = 'pending' }: ApiStatusIndicatorsProps) {
  const standardIndicators = [
    { 
      name: 'Profile', 
      hasData: completionStates.companyEnrichment,
      isLoading: loadingStates.companyEnrichment
    },
    { 
      name: 'CRM', 
      hasData: completionStates.hubspot,
      isLoading: loadingStates.hubspot
    },
    { 
      name: 'Content', 
      hasData: completionStates.apifyContent,
      isLoading: loadingStates.apifyContent
    },
  ];

  const accountIndicatorClass = (() => {
    switch (accountStatus) {
      case 'success':
        return 'bg-green-500';
      case 'failure':
        return 'bg-red-500';
      case 'pending':
      default:
        return 'bg-yellow-400';
    }
  })();

  return (
    <div className="flex gap-4 items-center">
      {standardIndicators.map((indicator) => (
        <div key={indicator.name} className="flex flex-col items-center gap-1">
          <span className="text-xs text-gray-600 font-medium">{indicator.name}</span>
          <div
            className={`w-3 h-3 rounded-full ${
              isFirstRun
                ? 'bg-transparent border-2 border-dashed border-gray-300 opacity-60'
                : indicator.isLoading 
                  ? 'bg-yellow-400 animate-pulse' 
                  : indicator.hasData 
                    ? 'bg-green-500' 
                    : 'bg-gray-300'
            }`}
          />
        </div>
      ))}
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-gray-600 font-medium">Account</span>
        <div
          className={`w-3 h-3 rounded-full ${accountIndicatorClass}`}
        />
      </div>
    </div>
  );
}
