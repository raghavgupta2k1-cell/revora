
// REVORA Background Service Worker

// Open side panel when REVORA icon is clicked
async function setupSidePanel() {
    await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
    });
}

// Run when extension is installed or Chrome starts
chrome.runtime.onInstalled.addListener(() => {
    setupSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
    setupSidePanel();
});

// Test communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message?.action === "REVORA_PING") {
        sendResponse({
            success: true,
            message: "REVORA background is running."
        });
    }

    return true;
});
