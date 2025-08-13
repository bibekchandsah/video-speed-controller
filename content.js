// Video Speed Controller - Content Script
// Handles video detection, speed control, and keyboard shortcuts

class VideoSpeedController {
  constructor() {
    this.videos = new Set();
    this.currentSpeed = 1.0;
    this.isEnabled = true;
    this.domain = window.location.hostname;
    this.speedDisplay = null;
    this.displayTimeout = null;
    this.maxSpeed = 4.0; // Default max speed, will be loaded from settings
    
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupVideoObserver();
    this.setupKeyboardShortcuts();
    this.createSpeedDisplay();
    this.findExistingVideos();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'persistenceEnabled',
        `speed_${this.domain}`,
        'globalEnabled',
        'maxSpeed'
      ]);
      
      this.isEnabled = result.globalEnabled !== false;
      this.maxSpeed = result.maxSpeed || 4.0;
      const savedSpeed = result[`speed_${this.domain}`];
      
      if (result.persistenceEnabled !== false && savedSpeed) {
        this.currentSpeed = savedSpeed;
        this.applySpeedToAllVideos();
      }
    } catch (error) {
      console.log('VideoSpeedController: Error loading settings:', error);
    }
  }

  setupVideoObserver() {
    // Observer for dynamically added videos
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.findVideosInElement(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  findExistingVideos() {
    this.findVideosInElement(document);
  }

  findVideosInElement(element) {
    const videos = element.querySelectorAll ? 
      element.querySelectorAll('video') : 
      (element.tagName === 'VIDEO' ? [element] : []);
    
    videos.forEach(video => this.addVideo(video));
  }

  addVideo(video) {
    if (this.videos.has(video)) return;
    
    this.videos.add(video);
    
    // Apply current speed if enabled
    if (this.isEnabled) {
      video.playbackRate = this.currentSpeed;
    }
    
    // Listen for video events
    video.addEventListener('loadedmetadata', () => {
      if (this.isEnabled) {
        video.playbackRate = this.currentSpeed;
      }
    });
    
    video.addEventListener('ratechange', () => {
      // Update current speed if changed externally
      if (Math.abs(video.playbackRate - this.currentSpeed) > 0.01) {
        this.currentSpeed = video.playbackRate;
        this.saveSpeed();
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      // Only handle shortcuts when not typing in input fields
      if (event.target.tagName === 'INPUT' || 
          event.target.tagName === 'TEXTAREA' || 
          event.target.isContentEditable) {
        return;
      }

      // Shift + > (faster)
      if (event.shiftKey && event.code === 'Period') {
        event.preventDefault();
        this.increaseSpeed();
      }
      
      // Shift + < (slower)
      if (event.shiftKey && event.code === 'Comma') {
        event.preventDefault();
        this.decreaseSpeed();
      }
      
      // Reset to normal speed (Shift + R)
      if (event.shiftKey && event.code === 'KeyR') {
        event.preventDefault();
        this.setSpeed(1.0);
      }
    });
  }

  increaseSpeed() {
    const newSpeed = Math.min(this.maxSpeed, this.currentSpeed + 0.25);
    this.setSpeed(newSpeed);
  }

  decreaseSpeed() {
    const newSpeed = Math.max(0.25, this.currentSpeed - 0.25);
    this.setSpeed(newSpeed);
  }

  setSpeed(speed) {
    this.currentSpeed = parseFloat(speed.toFixed(2));
    this.applySpeedToAllVideos();
    this.showSpeedDisplay();
    this.saveSpeed();
  }

  applySpeedToAllVideos() {
    this.videos.forEach(video => {
      if (video.readyState >= 1) { // HAVE_METADATA
        video.playbackRate = this.currentSpeed;
      }
    });
  }

  async saveSpeed() {
    try {
      await chrome.storage.sync.set({
        [`speed_${this.domain}`]: this.currentSpeed
      });
    } catch (error) {
      console.log('VideoSpeedController: Error saving speed:', error);
    }
  }

  createSpeedDisplay() {
    this.speedDisplay = document.createElement('div');
    this.speedDisplay.id = 'video-speed-display';
    this.speedDisplay.style.cssText = `
      position: fixed;
      top: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: rgba(255, 255, 255, 0.15);
      color: white;
      padding: 12px 24px;
      border-radius: 25px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      font-weight: 700;
      z-index: 10000;
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 
                  0 2px 8px rgba(0, 0, 0, 0.2),
                  inset 0 1px 0 rgba(255, 255, 255, 0.4);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      min-width: 80px;
      text-align: center;
      letter-spacing: 0.5px;
    `;
    document.body.appendChild(this.speedDisplay);
  }

  showSpeedDisplay() {
    if (!this.speedDisplay) return;
    
    this.speedDisplay.textContent = `${this.currentSpeed}x`;
    this.speedDisplay.style.opacity = '1';
    this.speedDisplay.style.transform = 'translateX(-50%) translateY(0)';
    
    clearTimeout(this.displayTimeout);
    this.displayTimeout = setTimeout(() => {
      this.speedDisplay.style.opacity = '0';
      this.speedDisplay.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 2500);
  }

  handleMessage(message, sendResponse) {
    switch (message.action) {
      case 'setSpeed':
        this.setSpeed(message.speed);
        sendResponse({ success: true, currentSpeed: this.currentSpeed });
        break;
        
      case 'getStatus':
        sendResponse({
          currentSpeed: this.currentSpeed,
          domain: this.domain,
          videoCount: this.videos.size,
          isEnabled: this.isEnabled
        });
        break;
        
      case 'toggleEnabled':
        this.isEnabled = message.enabled;
        if (this.isEnabled) {
          this.applySpeedToAllVideos();
        } else {
          this.videos.forEach(video => {
            video.playbackRate = 1.0;
          });
        }
        sendResponse({ success: true, isEnabled: this.isEnabled });
        break;
        
      case 'updateMaxSpeed':
        this.maxSpeed = message.maxSpeed;
        sendResponse({ success: true, maxSpeed: this.maxSpeed });
        break;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  }
}

// Initialize the controller when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VideoSpeedController();
  });
} else {
  new VideoSpeedController();
}