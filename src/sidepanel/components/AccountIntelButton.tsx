import React, { useState } from 'react';

interface AccountIntelButtonProps {
  accountIntel: string | undefined;
  companyName: string | undefined;
  matchType?: string;
  confidence?: number;
}

export function AccountIntelButton({ 
  accountIntel, 
  companyName,
  matchType,
  confidence 
}: AccountIntelButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Helper function to check if account intel is real content or just placeholder variables
  const isRealAccountIntel = (intel: string | undefined): boolean => {
    if (!intel || intel.trim() === '') return false;
    
    // Check if the content is mostly just placeholder variables like {Variable_Name?}
    const placeholderPattern = /\{[A-Za-z_]+\?\}/g;
    const placeholders = intel.match(placeholderPattern) || [];
    const placeholderText = placeholders.join('');
    
    // Remove all placeholders and check if there's meaningful content left
    const contentWithoutPlaceholders = intel
      .replace(placeholderPattern, '')
      .replace(/[-\s\n]/g, '') // Remove whitespace, dashes, newlines
      .trim();
    
    // If there's no content after removing placeholders, it's not real intel
    if (contentWithoutPlaceholders.length === 0) return false;
    
    // If more than 80% of the content is placeholders, it's not real intel
    const placeholderRatio = placeholderText.length / intel.length;
    if (placeholderRatio > 0.8) return false;
    
    return true;
  };
  
  const hasAccountIntel = isRealAccountIntel(accountIntel);

  return (
    <>
      {/* Account Intel Button */}
      <button
        onClick={() => hasAccountIntel && setIsOpen(!isOpen)}
        disabled={!hasAccountIntel}
        className={`h-fit px-3 py-1.5 rounded-lg font-semibold text-xs transition-all duration-200 flex items-center gap-1.5 ${
          hasAccountIntel
            ? 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
        title={hasAccountIntel ? 'Click to view account intelligence' : 'No account intel available for this company'}
      >
        <svg 
          className="w-3.5 h-3.5" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" 
          />
        </svg>
        <span>Account Intel</span>
      </button>

      {/* Account Intel Modal - Centered */}
      {isOpen && hasAccountIntel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 bg-green-50">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-green-900 flex items-center gap-2 text-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Account Intelligence Report
                  </h3>
                  {companyName && (
                    <p className="text-sm text-green-700 mt-1">{companyName}</p>
                  )}
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-green-600 hover:text-green-800 transition-colors"
                  title="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Match Info Badge */}
              {matchType && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-green-100 rounded-full text-xs text-green-800 font-medium">
                  {matchType === 'website' ? (
                    <>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Exact Website Match
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                      Fuzzy Name Match ({confidence}%)
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Account Intel Content */}
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {accountIntel}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-xs text-gray-600">
                {accountIntel?.length.toLocaleString()} characters
              </div>
              <button
                onClick={() => {
                  if (accountIntel) {
                    navigator.clipboard.writeText(accountIntel);
                  }
                }}
                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-medium flex items-center gap-1 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

