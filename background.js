// Video Speed Controller - Background Script
// Handles extension lifecycle and coordination

class BackgroundController {
  constructor() {
    this.init();
  }

  init() {
    // Initialize default settings on install
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstall(details);
    });

    // Handle tab updates to apply saved speeds
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
  }

  async handleInstall(details) {
    if (details.reason === 'install') {
      // Set default settings
      await chrome.storage.sync.set({
        persistenceEnabled: true,
        globalEnabled: true,
        maxSpeed: 4.0,
        shortcuts: {
          increase: { key: 'Period', shift: true, ctrl: false, alt: false },
          decrease: { key: 'Comma', shift: true, ctrl: false, alt: false },
          reset: { key: 'KeyR', shift: true, ctrl: false, alt: false }
        }
      });
      
      console.log('Video Speed Controller installed with default settings');
    }
  }

  async handleTabUpdate(tabId, changeInfo, tab) {
    // Only act when the page has finished loading
    if (changeInfo.status !== 'complete' || !tab.url) return;
    
    // Skip non-http(s) URLs
    if (!tab.url.startsWith('http')) return;

    try {
      // Check if persistence is enabled
      const result = await chrome.storage.sync.get(['persistenceEnabled']);
      if (result.persistenceEnabled === false) return;

      // Get domain-specific speed setting
      const domain = new URL(tab.url).hostname;
      const speedResult = await chrome.storage.sync.get([`speed_${domain}`]);
      const savedSpeed = speedResult[`speed_${domain}`];

      if (savedSpeed) {
        // Small delay to ensure content script is ready
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tabId, {
              action: 'setSpeed',
              speed: savedSpeed
            });
          } catch (error) {
            // Content script might not be ready yet, ignore
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Error handling tab update:', error);
    }
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'getSettings':
        this.getSettings(sendResponse);
        return true; // Keep message channel open for async response
        
      case 'saveSettings':
        this.saveSettings(message.settings, sendResponse);
        return true;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  async getSettings(sendResponse) {
    try {
      const result = await chrome.storage.sync.get([
        'persistenceEnabled',
        'globalEnabled'
      ]);
      sendResponse({ success: true, settings: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async saveSettings(settings, sendResponse) {
    try {
      await chrome.storage.sync.set(settings);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
}

// Initialize background controller
new BackgroundController();