import { useState } from "react";

export const useActiveTabUrl = () => {
  const [url, setUrl] = useState("");
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);

  chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const [tab] = tabs;
    if (tab) {
      setUrl(tab.url || "");
      setCurrentTabId(tab.id || null);
      setCurrentWindowId(tab.windowId);
    }
  });
  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (activeInfo.tabId && activeInfo.windowId === currentWindowId) {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        setUrl(tab.url || "");
        setCurrentTabId(tab.id || null);
      });
    }
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId === currentTabId && changeInfo.url) {
      setUrl(changeInfo.url);
    }
  });

  return url;
};
