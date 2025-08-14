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

    // Handle tab activation to update badge for current tab
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabActivated(activeInfo);
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

      case 'updateBadge':
        this.updateBadge(message.speed, sender.tab.id);
        sendResponse({ success: true });
        break;

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

  updateBadge(speed, tabId) {
    try {
      // Format speed for badge display
      let badgeText = '';
      if (speed && speed !== 1.0) {
        // Show speed without 'x' to save space
        if (speed % 1 === 0) {
          // Whole number (2.0 -> "2")
          badgeText = speed.toString();
        } else {
          // Decimal - round to 1 decimal place properly
          // This ensures 2.25 shows as "2.3" instead of "2.2"
          badgeText = Math.round(speed * 10) / 10;
          badgeText = badgeText.toString();
        }
      }

      // Set badge text (empty string clears the badge)
      chrome.action.setBadgeText({
        text: badgeText,
        tabId: tabId
      });

      // Only set background color if there's text to show
      if (badgeText) {
        // Beautiful blue-purple gradient color (using the dominant color from your image)
        chrome.action.setBadgeBackgroundColor({
          color: '#6366F1', // Indigo-500, matches the blue-purple gradient
          tabId: tabId
        });
      }

      console.log(`Badge updated to: "${badgeText}" for tab ${tabId}`);
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }

  async handleTabActivated(activeInfo) {
    try {
      // Get the domain for the activated tab
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (!tab.url || !tab.url.startsWith('http')) {
        // Clear badge for non-http tabs
        chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
        return;
      }

      const domain = new URL(tab.url).hostname;
      const speedResult = await chrome.storage.sync.get([`speed_${domain}`]);
      const savedSpeed = speedResult[`speed_${domain}`];

      if (savedSpeed) {
        this.updateBadge(savedSpeed, activeInfo.tabId);
      } else {
        // Clear badge if no saved speed (default 1.0x)
        chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
      }
    } catch (error) {
      console.error('Error handling tab activation:', error);
    }
  }
}

// Initialize background controller
new BackgroundController();