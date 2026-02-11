import { ChangeEvent } from "react";
import { ResearchButtonsProps } from "../types/execute-view.types";
import {removeTokens} from "@/utils/auth";



const handleLogout = () =>{
    removeTokens();
    window.location.reload();
}

export function ResearchButtons({
  loadingUI,
  currentUsername,
  fetchLinkedInProfileData,
  autoRun,
  setAutoRun,
  refreshCRMData,
  stopResearch,
}: ResearchButtonsProps) {
  const toggleAutoRun = (e: ChangeEvent<HTMLInputElement>) => {
    localStorage.setItem("narrative-ai-auto-run", String(e.target.checked));
    setAutoRun(e.target.checked);
    if (currentUsername && e.target.checked) {
      fetchLinkedInProfileData({ profile_id: currentUsername });
    }
  };


  return (
      <>
    <div className="mb-4 w-full flex items-center justify-between gap-2 font-bold pr-3">
      <button
        disabled={loadingUI}
        className="btn-primary flex-1 h-fit px-2 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm"
        onClick={() => {
          currentUsername &&
            fetchLinkedInProfileData({
              profile_id: currentUsername,
            });
        }}
      >
        Research
      </button>
      
      {/* Stop Research Button */}
      <button
        disabled={false}
        className="bg-red-600 text-white flex-1 h-fit px-2 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:bg-red-700 text-sm"
        onClick={stopResearch}
      >
        Stop
      </button>
      
      {/* Auto Button (renamed from Auto-Run to save space) */}
      <label
        htmlFor="auto-run"
        className="btn-primary flex items-center justify-center cursor-pointer flex-1 px-2 py-2 rounded-lg hover:opacity-90 transition-opacity text-sm"
      >
        <input
          checked={autoRun}
          type="checkbox"
          id="auto-run"
          className="h-4 w-4 mr-1 rounded-full accent-white cursor-pointer flex-shrink-0"
          onChange={toggleAutoRun}
        />
        <span className="whitespace-nowrap">Auto</span>
      </label>

      {/* Logout Button */}
      <button 
        className="bg-gray-600 text-white flex-1 h-fit px-2 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm" 
        onClick={handleLogout}
      >
        Logout
      </button>
    </div>
      </>
  );
}