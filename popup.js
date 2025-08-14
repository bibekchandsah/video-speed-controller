// Video Speed Controller - Popup Script
// Handles popup UI interactions and communication with content script

class PopupController {
  constructor() {
    this.currentTab = null;
    this.elements = {};
    this.init();
  }

  async init() {
    this.bindElements();
    this.setupEventListeners();
    await this.getCurrentTab();
    await this.loadSettings();
    await this.updateStatus();
  }

  bindElements() {
    this.elements = {
      persistenceToggle: document.getElementById('persistenceToggle'),
      persistenceLabel: document.getElementById('persistenceLabel'),
      speedInput: document.getElementById('speedInput'),
      applySpeedBtn: document.getElementById('applySpeedBtn'),
      maxSpeedInput: document.getElementById('maxSpeedInput'),
      saveMaxSpeedBtn: document.getElementById('saveMaxSpeedBtn'),
      currentSpeed: document.getElementById('currentSpeed'),
      currentDomain: document.getElementById('currentDomain'),
      maxSpeedDisplay: document.getElementById('maxSpeedDisplay'),
      messageContainer: document.getElementById('messageContainer'),
      messageText: document.getElementById('messageText'),
      presetBtns: document.querySelectorAll('.preset-btn:not(.max-preset)'),
      maxPresetBtns: document.querySelectorAll('.max-preset'),
      // Shortcut elements
      increaseShortcut: document.getElementById('increaseShortcut'),
      decreaseShortcut: document.getElementById('decreaseShortcut'),
      resetShortcut: document.getElementById('resetShortcut'),
      recordIncreaseBtn: document.getElementById('recordIncreaseBtn'),
      recordDecreaseBtn: document.getElementById('recordDecreaseBtn'),
      recordResetBtn: document.getElementById('recordResetBtn'),
      saveShortcutsBtn: document.getElementById('saveShortcutsBtn'),
      resetShortcutsBtn: document.getElementById('resetShortcutsBtn'),
      shortcutDisplay: document.getElementById('shortcutDisplay'),
      // Educational platform elements
      educationalSection: document.getElementById('educationalSection'),
      platformName: document.getElementById('platformName'),
      educationalPresets: document.getElementById('educationalPresets'),
      platformStatus: document.getElementById('platformStatus'),
      platformStatusItem: document.getElementById('platformStatusItem')
    };
    
    this.recordingShortcut = null;
    this.currentPlatform = null;
    this.platformConfig = null;
    this.shortcuts = {
      increase: { key: 'Period', shift: true, ctrl: false, alt: false },
      decrease: { key: 'Comma', shift: true, ctrl: false, alt: false },
      reset: { key: 'KeyR', shift: true, ctrl: false, alt: false }
    };
  }

  setupEventListeners() {
    // Persistence toggle
    this.elements.persistenceToggle.addEventListener('change', (e) => {
      this.handlePersistenceToggle(e.target.checked);
    });

    // Manual speed input
    this.elements.speedInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.applyManualSpeed();
      }
    });

    this.elements.applySpeedBtn.addEventListener('click', () => {
      this.applyManualSpeed();
    });

    // Max speed input and button
    this.elements.maxSpeedInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveMaxSpeed();
      }
    });

    this.elements.saveMaxSpeedBtn.addEventListener('click', () => {
      this.saveMaxSpeed();
    });

    // Preset buttons
    this.elements.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        this.applySpeed(speed);
        this.updatePresetButtons(speed);
      });
    });

    // Max speed preset buttons
    this.elements.maxPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const maxSpeed = parseFloat(btn.dataset.speed);
        this.elements.maxSpeedInput.value = maxSpeed;
        this.saveMaxSpeed();
        this.updateMaxPresetButtons(maxSpeed);
      });
    });

    // Shortcut recording buttons
    this.elements.recordIncreaseBtn.addEventListener('click', () => {
      this.startRecording('increase');
    });

    this.elements.recordDecreaseBtn.addEventListener('click', () => {
      this.startRecording('decrease');
    });

    this.elements.recordResetBtn.addEventListener('click', () => {
      this.startRecording('reset');
    });

    // Shortcut actions
    this.elements.saveShortcutsBtn.addEventListener('click', async () => {
      // Test Chrome storage first
      await this.testChromeStorage();
      await this.saveShortcuts();
    });

    this.elements.resetShortcutsBtn.addEventListener('click', () => {
      this.resetShortcuts();
    });

    // Global keydown listener for recording shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.recordingShortcut) {
        e.preventDefault();
        this.recordKeyPress(e);
      }
    });
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
    } catch (error) {
      console.error('Error getting current tab:', error);
    }
  }

  async loadSettings() {
    try {
      console.log('Loading settings from Chrome storage...');
      
      const result = await chrome.storage.sync.get([
        'persistenceEnabled',
        'globalEnabled',
        'maxSpeed',
        'shortcuts'
      ]);
      
      console.log('Loaded settings:', result);
      
      const persistenceEnabled = result.persistenceEnabled !== false;
      this.elements.persistenceToggle.checked = persistenceEnabled;
      this.elements.persistenceLabel.textContent = persistenceEnabled ? 'Enabled' : 'Disabled';
      
      const maxSpeed = result.maxSpeed || 4.0;
      this.elements.maxSpeedInput.value = maxSpeed;
      this.elements.maxSpeedDisplay.textContent = `${maxSpeed}x`;
      this.elements.speedInput.max = maxSpeed;
      this.updateMaxPresetButtons(maxSpeed);

      // Load shortcuts with validation
      if (result.shortcuts && this.isValidShortcutsObject(result.shortcuts)) {
        this.shortcuts = result.shortcuts;
        console.log('Loaded shortcuts from storage:', this.shortcuts);
      } else {
        console.log('Using default shortcuts (no valid shortcuts found in storage)');
        // Keep default shortcuts from constructor
      }
      
      this.updateShortcutDisplay();
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showMessage('Error loading settings', 'error');
    }
  }

  isValidShortcutsObject(shortcuts) {
    if (!shortcuts || typeof shortcuts !== 'object') return false;
    
    const requiredKeys = ['increase', 'decrease', 'reset'];
    return requiredKeys.every(key => {
      const shortcut = shortcuts[key];
      return shortcut && 
             typeof shortcut.key === 'string' && 
             typeof shortcut.shift === 'boolean' &&
             typeof shortcut.ctrl === 'boolean' &&
             typeof shortcut.alt === 'boolean';
    });
  }

  async updateStatus() {
    if (!this.currentTab) return;

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getStatus'
      });

      if (response) {
        this.elements.currentSpeed.textContent = `${response.currentSpeed}x`;
        this.elements.currentDomain.textContent = response.domain || 'Unknown';
        this.updatePresetButtons(response.currentSpeed);
        this.elements.speedInput.value = response.currentSpeed;
        
        // Handle educational platform features
        if (response.educationalPlatform && response.platformConfig) {
          this.setupEducationalPlatform(response.educationalPlatform, response.platformConfig);
        } else {
          this.hideEducationalSection();
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
      this.elements.currentDomain.textContent = this.currentTab?.url ? 
        new URL(this.currentTab.url).hostname : 'Unknown';
      this.hideEducationalSection();
    }
  }

  async handlePersistenceToggle(enabled) {
    try {
      await chrome.storage.sync.set({ persistenceEnabled: enabled });
      this.elements.persistenceLabel.textContent = enabled ? 'Enabled' : 'Disabled';
      this.showMessage(
        `Auto-apply speeds ${enabled ? 'enabled' : 'disabled'}`, 
        'success'
      );
    } catch (error) {
      console.error('Error saving persistence setting:', error);
      this.showMessage('Error saving setting', 'error');
    }
  }

  async applyManualSpeed() {
    const speedValue = parseFloat(this.elements.speedInput.value);
    const maxSpeed = parseFloat(this.elements.maxSpeedInput.value) || 4.0;
    
    if (isNaN(speedValue) || speedValue < 0.25 || speedValue > maxSpeed) {
      this.showMessage(`Please enter a speed between 0.25x and ${maxSpeed}x`, 'error');
      return;
    }

    await this.applySpeed(speedValue);
    this.updatePresetButtons(speedValue);
  }

  async saveMaxSpeed() {
    const maxSpeedValue = parseFloat(this.elements.maxSpeedInput.value);
    
    if (isNaN(maxSpeedValue) || maxSpeedValue < 2.0 || maxSpeedValue > 10.0) {
      this.showMessage('Please enter a max speed between 2.0x and 10.0x', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ maxSpeed: maxSpeedValue });
      this.elements.maxSpeedDisplay.textContent = `${maxSpeedValue}x`;
      this.elements.speedInput.max = maxSpeedValue;
      this.updateMaxPresetButtons(maxSpeedValue);
      this.showMessage(`Maximum speed set to ${maxSpeedValue}x`, 'success');
      
      // Notify content script about max speed change
      if (this.currentTab) {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'updateMaxSpeed',
          maxSpeed: maxSpeedValue
        });
      }
    } catch (error) {
      console.error('Error saving max speed:', error);
      this.showMessage('Error saving max speed setting', 'error');
    }
  }

  async applySpeed(speed) {
    if (!this.currentTab) {
      this.showMessage('No active tab found', 'error');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'setSpeed',
        speed: speed
      });

      if (response && response.success) {
        this.elements.currentSpeed.textContent = `${response.currentSpeed}x`;
        this.elements.speedInput.value = response.currentSpeed;
        this.showMessage(`Speed set to ${response.currentSpeed}x`, 'success');
      } else {
        throw new Error('Failed to set speed');
      }
    } catch (error) {
      console.error('Error applying speed:', error);
      this.showMessage('Error: No videos found on this page', 'error');
    }
  }

  updatePresetButtons(currentSpeed) {
    this.elements.presetBtns.forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(btnSpeed - currentSpeed) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  updateMaxPresetButtons(currentMaxSpeed) {
    this.elements.maxPresetBtns.forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(btnSpeed - currentMaxSpeed) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  startRecording(shortcutType) {
    this.recordingShortcut = shortcutType;
    const button = this.elements[`record${shortcutType.charAt(0).toUpperCase() + shortcutType.slice(1)}Btn`];
    const input = this.elements[`${shortcutType}Shortcut`];
    
    button.textContent = 'Recording...';
    button.classList.add('recording');
    input.classList.add('recording');
    input.value = 'Press keys...';
    
    // Stop recording after 5 seconds
    setTimeout(() => {
      if (this.recordingShortcut === shortcutType) {
        this.stopRecording();
      }
    }, 5000);
  }

  stopRecording() {
    if (!this.recordingShortcut) return;
    
    const shortcutType = this.recordingShortcut;
    const button = this.elements[`record${shortcutType.charAt(0).toUpperCase() + shortcutType.slice(1)}Btn`];
    const input = this.elements[`${shortcutType}Shortcut`];
    
    button.textContent = 'Record';
    button.classList.remove('recording');
    input.classList.remove('recording');
    
    this.recordingShortcut = null;
    this.updateShortcutDisplay();
  }

  recordKeyPress(event) {
    if (!this.recordingShortcut) return;
    
    // Ignore modifier-only keys
    const modifierKeys = [
      'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 
      'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'
    ];
    
    if (modifierKeys.includes(event.code)) {
      return; // Don't record modifier keys alone
    }
    
    // Only record if we have a non-modifier key
    const shortcut = {
      key: event.code,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    };
    
    this.shortcuts[this.recordingShortcut] = shortcut;
    this.stopRecording();
  }

  async saveShortcuts() {
    try {
      // Validate shortcuts before saving
      if (!this.validateShortcuts()) {
        this.showMessage('Invalid shortcut configuration', 'error');
        return;
      }

      console.log('Saving shortcuts:', this.shortcuts);
      
      // Save to Chrome storage
      await chrome.storage.sync.set({ shortcuts: this.shortcuts });
      console.log('Shortcuts saved to storage successfully');
      
      this.showMessage('Shortcuts saved successfully!', 'success');
      
      // Notify content script about shortcut changes (non-blocking)
      if (this.currentTab && this.currentTab.url && this.currentTab.url.startsWith('http')) {
        try {
          await chrome.tabs.sendMessage(this.currentTab.id, {
            action: 'updateShortcuts',
            shortcuts: this.shortcuts
          });
          console.log('Content script notified successfully');
        } catch (contentError) {
          console.log('Content script notification failed (this is normal for some pages):', contentError.message);
          // Don't show error to user as this is expected for some pages
        }
      }
    } catch (error) {
      console.error('Error saving shortcuts:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Error saving shortcuts';
      if (error.message.includes('QUOTA_BYTES')) {
        errorMessage = 'Storage quota exceeded. Please reset some settings.';
      } else if (error.message.includes('MAX_ITEMS')) {
        errorMessage = 'Too many items in storage. Please reset some settings.';
      } else if (error.message.includes('MAX_WRITE_OPERATIONS')) {
        errorMessage = 'Too many save operations. Please wait a moment and try again.';
      }
      
      this.showMessage(errorMessage, 'error');
    }
  }

  validateShortcuts() {
    // Check if shortcuts object exists and has required properties
    if (!this.shortcuts || typeof this.shortcuts !== 'object') {
      console.error('Invalid shortcuts object');
      return false;
    }

    const requiredShortcuts = ['increase', 'decrease', 'reset'];
    for (const shortcutType of requiredShortcuts) {
      const shortcut = this.shortcuts[shortcutType];
      if (!shortcut || typeof shortcut !== 'object') {
        console.error(`Missing or invalid shortcut: ${shortcutType}`);
        return false;
      }

      // Validate shortcut properties
      if (typeof shortcut.key !== 'string' || !shortcut.key) {
        console.error(`Invalid key for shortcut: ${shortcutType}`);
        return false;
      }

      if (typeof shortcut.shift !== 'boolean' || 
          typeof shortcut.ctrl !== 'boolean' || 
          typeof shortcut.alt !== 'boolean') {
        console.error(`Invalid modifier flags for shortcut: ${shortcutType}`);
        return false;
      }
    }

    return true;
  }

  async resetShortcuts() {
    try {
      this.shortcuts = {
        increase: { key: 'Period', shift: true, ctrl: false, alt: false },
        decrease: { key: 'Comma', shift: true, ctrl: false, alt: false },
        reset: { key: 'KeyR', shift: true, ctrl: false, alt: false }
      };
      
      console.log('Resetting shortcuts to default:', this.shortcuts);
      
      await this.saveShortcuts();
      this.updateShortcutDisplay();
      
      // Only show reset message if save was successful
      if (this.validateShortcuts()) {
        this.showMessage('Shortcuts reset to default', 'success');
      }
    } catch (error) {
      console.error('Error resetting shortcuts:', error);
      this.showMessage('Error resetting shortcuts', 'error');
    }
  }

  updateShortcutDisplay() {
    const formatShortcut = (shortcut) => {
      let keys = [];
      if (shortcut.ctrl) keys.push('Ctrl');
      if (shortcut.alt) keys.push('Alt');
      if (shortcut.shift) keys.push('Shift');
      
      let keyName = this.getKeyDisplayName(shortcut.key);
      keys.push(keyName);
      return keys.join('+');
    };

    this.elements.increaseShortcut.value = formatShortcut(this.shortcuts.increase);
    this.elements.decreaseShortcut.value = formatShortcut(this.shortcuts.decrease);
    this.elements.resetShortcut.value = formatShortcut(this.shortcuts.reset);
    
    // Update footer display
    const increaseText = formatShortcut(this.shortcuts.increase);
    const decreaseText = formatShortcut(this.shortcuts.decrease);
    const resetText = formatShortcut(this.shortcuts.reset);
    
    this.elements.shortcutDisplay.textContent = 
      `Shortcuts: ${increaseText} (faster) | ${decreaseText} (slower) | ${resetText} (reset)`;
  }

  getKeyDisplayName(keyCode) {
    // Handle special cases for better display
    const keyMap = {
      'Period': '>',
      'Comma': '<',
      'Space': 'Space',
      'Enter': 'Enter',
      'Escape': 'Esc',
      'Backspace': 'Backspace',
      'Tab': 'Tab',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Delete': 'Del',
      'Insert': 'Ins',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PgUp',
      'PageDown': 'PgDn'
    };

    if (keyMap[keyCode]) {
      return keyMap[keyCode];
    }

    // Handle Key* codes (KeyA -> A, KeyP -> P, etc.)
    if (keyCode.startsWith('Key')) {
      return keyCode.slice(3);
    }

    // Handle Digit* codes (Digit1 -> 1, Digit2 -> 2, etc.)
    if (keyCode.startsWith('Digit')) {
      return keyCode.slice(5);
    }

    // Handle F* keys (F1, F2, etc.)
    if (keyCode.startsWith('F') && keyCode.length <= 3) {
      return keyCode;
    }

    // Handle Numpad keys
    if (keyCode.startsWith('Numpad')) {
      return 'Num' + keyCode.slice(6);
    }

    // Return the original code for anything else
    return keyCode;
  }

  async testChromeStorage() {
    try {
      console.log('Testing Chrome storage...');
      
      // Test write
      const testKey = 'test_' + Date.now();
      const testValue = { test: true, timestamp: Date.now() };
      
      await chrome.storage.sync.set({ [testKey]: testValue });
      console.log('Chrome storage write test: SUCCESS');
      
      // Test read
      const result = await chrome.storage.sync.get([testKey]);
      if (result[testKey] && result[testKey].test === true) {
        console.log('Chrome storage read test: SUCCESS');
      } else {
        throw new Error('Read test failed');
      }
      
      // Clean up test data
      await chrome.storage.sync.remove([testKey]);
      console.log('Chrome storage cleanup: SUCCESS');
      
      return true;
    } catch (error) {
      console.error('Chrome storage test failed:', error);
      this.showMessage('Chrome storage test failed: ' + error.message, 'error');
      return false;
    }
  }

  setupEducationalPlatform(platform, config) {
    this.currentPlatform = platform;
    this.platformConfig = config;
    
    // Show educational section
    this.elements.educationalSection.style.display = 'block';
    this.elements.platformStatusItem.style.display = 'flex';
    
    // Update platform info
    this.elements.platformName.textContent = config.name;
    this.elements.platformStatus.textContent = config.name;
    
    // Add platform-specific styling
    this.elements.educationalSection.className = `setting-section platform-${platform}`;
    
    // Create educational speed presets
    this.createEducationalPresets(config);
    
    console.log(`Educational platform setup: ${config.name}`);
  }

  createEducationalPresets(config) {
    this.elements.educationalPresets.innerHTML = '';
    
    config.recommendedSpeeds.forEach(speed => {
      const button = document.createElement('button');
      button.className = 'educational-preset-btn';
      button.textContent = `${speed}x`;
      button.dataset.speed = speed;
      
      // Mark recommended speeds
      if (speed === config.defaultSpeed) {
        button.classList.add('recommended');
        button.title = 'Recommended for this platform';
      }
      
      button.addEventListener('click', async () => {
        await this.applyEducationalSpeed(speed);
        this.updateEducationalPresets(speed);
      });
      
      this.elements.educationalPresets.appendChild(button);
    });
  }

  async applyEducationalSpeed(speed) {
    if (!this.currentTab) {
      this.showMessage('No active tab found', 'error');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'applyEducationalSpeed',
        speed: speed
      });

      if (response && response.success) {
        this.elements.currentSpeed.textContent = `${response.currentSpeed}x`;
        this.elements.speedInput.value = response.currentSpeed;
        this.showMessage(`${this.platformConfig.name} speed: ${response.currentSpeed}x`, 'success');
        this.updatePresetButtons(response.currentSpeed);
      } else {
        throw new Error('Failed to apply educational speed');
      }
    } catch (error) {
      console.error('Error applying educational speed:', error);
      this.showMessage('Error applying speed', 'error');
    }
  }

  updateEducationalPresets(currentSpeed) {
    const presetButtons = this.elements.educationalPresets.querySelectorAll('.educational-preset-btn');
    presetButtons.forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(btnSpeed - currentSpeed) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  hideEducationalSection() {
    this.elements.educationalSection.style.display = 'none';
    this.elements.platformStatusItem.style.display = 'none';
    this.currentPlatform = null;
    this.platformConfig = null;
  }

  showMessage(text, type = 'success') {
    this.elements.messageText.textContent = text;
    this.elements.messageText.className = `message ${type}`;
    this.elements.messageContainer.style.display = 'block';

    setTimeout(() => {
      this.elements.messageContainer.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});