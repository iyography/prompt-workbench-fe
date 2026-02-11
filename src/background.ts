export {};

// When users click on the action toolbar icon open the side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for runtime update events
chrome.runtime.onUpdateAvailable.addListener((details) => {
  // Immediately reload the extension to apply the update
  chrome.runtime.reload();
});

// Check for updates periodically (every hour)
setInterval(
  () => {
    chrome.runtime.requestUpdateCheck((status, details) => {
      if (status === "update_available" && details) {
        chrome.runtime.reload();
      }
    });
  },
  60 * 60 * 1000,
); // Check every hour

// Force update check when extension starts
chrome.runtime.requestUpdateCheck((status, details) => {
  if (status === "update_available" && details) {
    chrome.runtime.reload();
  }
});
