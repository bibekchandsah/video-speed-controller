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
      currentSpeed: document.getElementById('currentSpeed'),
      currentDomain: document.getElementById('currentDomain'),
      messageContainer: document.getElementById('messageContainer'),
      messageText: document.getElementById('messageText'),
      presetBtns: document.querySelectorAll('.preset-btn')
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

    // Preset buttons
    this.elements.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        this.applySpeed(speed);
        this.updatePresetButtons(speed);
      });
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
      const result = await chrome.storage.sync.get([
        'persistenceEnabled',
        'globalEnabled'
      ]);
      
      const persistenceEnabled = result.persistenceEnabled !== false;
      this.elements.persistenceToggle.checked = persistenceEnabled;
      this.elements.persistenceLabel.textContent = persistenceEnabled ? 'Enabled' : 'Disabled';
    } catch (error) {
      console.error('Error loading settings:', error);
    }
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
      }
    } catch (error) {
      console.error('Error updating status:', error);
      this.elements.currentDomain.textContent = this.currentTab?.url ? 
        new URL(this.currentTab.url).hostname : 'Unknown';
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
    
    if (isNaN(speedValue) || speedValue < 0.25 || speedValue > 4.0) {
      this.showMessage('Please enter a speed between 0.25x and 4.0x', 'error');
      return;
    }

    await this.applySpeed(speedValue);
    this.updatePresetButtons(speedValue);
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