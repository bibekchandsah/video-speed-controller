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
    this.shortcuts = {
      increase: { key: 'Period', shift: true, ctrl: false, alt: false },
      decrease: { key: 'Comma', shift: true, ctrl: false, alt: false },
      reset: { key: 'KeyR', shift: true, ctrl: false, alt: false }
    };
    this.educationalPlatform = this.detectEducationalPlatform();
    this.platformConfig = this.getPlatformConfig();
    
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupVideoObserver();
    this.setupKeyboardShortcuts();
    this.createSpeedDisplay();
    this.findExistingVideos();
    this.setupDisplayProtection();
    this.setupEducationalFeatures();
    
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
        'maxSpeed',
        'shortcuts'
      ]);
      
      this.isEnabled = result.globalEnabled !== false;
      this.maxSpeed = result.maxSpeed || 4.0;
      
      // Load custom shortcuts
      if (result.shortcuts) {
        this.shortcuts = result.shortcuts;
      }
      
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

      // Check for custom shortcuts
      if (this.matchesShortcut(event, this.shortcuts.increase)) {
        event.preventDefault();
        this.increaseSpeed();
      } else if (this.matchesShortcut(event, this.shortcuts.decrease)) {
        event.preventDefault();
        this.decreaseSpeed();
      } else if (this.matchesShortcut(event, this.shortcuts.reset)) {
        event.preventDefault();
        this.setSpeed(1.0);
      }
    });
  }

  matchesShortcut(event, shortcut) {
    return event.code === shortcut.key &&
           event.shiftKey === shortcut.shift &&
           event.ctrlKey === shortcut.ctrl &&
           event.altKey === shortcut.alt;
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
      position: fixed !important;
      top: 20px !important;
      left: 50% !important;
      transform: translateX(-50%) translateY(-20px) !important;
      background: rgba(255, 255, 255, 0.15) !important;
      color: white !important;
      padding: 12px 24px !important;
      border-radius: 25px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 16px !important;
      font-weight: 700 !important;
      z-index: 2147483647 !important;
      opacity: 0 !important;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
      pointer-events: none !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 
                  0 2px 8px rgba(0, 0, 0, 0.2),
                  inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) !important;
      min-width: 80px !important;
      text-align: center !important;
      letter-spacing: 0.5px !important;
      margin: 0 !important;
      width: auto !important;
      height: auto !important;
      display: block !important;
      visibility: visible !important;
      overflow: visible !important;
      clip: auto !important;
      clip-path: none !important;
    `;
    
    // Ensure it's added to the document root to avoid any container restrictions
    if (document.body) {
      document.body.appendChild(this.speedDisplay);
    } else {
      document.documentElement.appendChild(this.speedDisplay);
    }
  }

  setupDisplayProtection() {
    // Periodically check if the display element is still properly positioned
    setInterval(() => {
      if (this.speedDisplay && document.contains(this.speedDisplay)) {
        // Ensure the display maintains its properties
        const computedStyle = window.getComputedStyle(this.speedDisplay);
        if (computedStyle.position !== 'fixed' || computedStyle.zIndex < '2147483647') {
          this.createSpeedDisplay();
        }
      }
    }, 5000);
  }

  showSpeedDisplay() {
    if (!this.speedDisplay) {
      this.createSpeedDisplay();
    }
    
    // Ensure the display is still in the DOM
    if (!document.contains(this.speedDisplay)) {
      if (document.body) {
        document.body.appendChild(this.speedDisplay);
      } else {
        document.documentElement.appendChild(this.speedDisplay);
      }
    }
    
    this.speedDisplay.textContent = `${this.currentSpeed}x`;
    this.speedDisplay.style.setProperty('opacity', '1', 'important');
    this.speedDisplay.style.setProperty('transform', 'translateX(-50%) translateY(0)', 'important');
    this.speedDisplay.style.setProperty('visibility', 'visible', 'important');
    this.speedDisplay.style.setProperty('display', 'block', 'important');
    
    clearTimeout(this.displayTimeout);
    this.displayTimeout = setTimeout(() => {
      this.speedDisplay.style.setProperty('opacity', '0', 'important');
      this.speedDisplay.style.setProperty('transform', 'translateX(-50%) translateY(-20px)', 'important');
    }, 2500);
  }

  detectEducationalPlatform() {
    const hostname = window.location.hostname.toLowerCase();
    const url = window.location.href.toLowerCase();
    
    if (hostname.includes('coursera.org')) return 'coursera';
    if (hostname.includes('udemy.com')) return 'udemy';
    if (hostname.includes('khanacademy.org')) return 'khanacademy';
    if (hostname.includes('apnacollege.in') || hostname.includes('apnacollege.com')) return 'apnacollege';
    if (hostname.includes('youtube.com') && (url.includes('playlist') || url.includes('educational'))) return 'youtube-edu';
    
    return null;
  }

  getPlatformConfig() {
    const configs = {
      coursera: {
        name: 'Coursera',
        recommendedSpeeds: [1.25, 1.5, 1.75, 2.0],
        defaultSpeed: 1.25,
        features: ['autoSkipIntro', 'chapterNavigation', 'noteTimestamps'],
        videoSelectors: ['video', '.video-player video', '.rc-VideoPlayer video'],
        skipIntroSelector: '.skip-intro-button, .rc-SkipButton',
        maxRecommendedSpeed: 2.5
      },
      udemy: {
        name: 'Udemy',
        recommendedSpeeds: [1.25, 1.5, 1.75, 2.0, 2.25],
        defaultSpeed: 1.5,
        features: ['autoSkipIntro', 'lectureProgress', 'noteTimestamps'],
        videoSelectors: ['video', '.video-player video', '.vjs-tech'],
        skipIntroSelector: '.skip-button, .udemy-btn',
        maxRecommendedSpeed: 3.0
      },
      khanacademy: {
        name: 'Khan Academy',
        recommendedSpeeds: [1.0, 1.25, 1.5, 1.75],
        defaultSpeed: 1.25,
        features: ['practiceMode', 'conceptReview', 'progressTracking'],
        videoSelectors: ['video', '.ka-video-player video'],
        skipIntroSelector: '.skip-intro',
        maxRecommendedSpeed: 2.0
      },
      apnacollege: {
        name: 'Apna College',
        recommendedSpeeds: [1.25, 1.5, 1.75, 2.0, 2.25, 2.5],
        defaultSpeed: 1.5,
        features: ['codingMode', 'lectureNotes', 'practiceProblems'],
        videoSelectors: ['video', '.video-player video', '.plyr__video'],
        skipIntroSelector: '.skip-intro, .skip-button',
        maxRecommendedSpeed: 3.0
      },
      'youtube-edu': {
        name: 'YouTube Education',
        recommendedSpeeds: [1.25, 1.5, 1.75, 2.0],
        defaultSpeed: 1.25,
        features: ['playlistMode', 'chapterNavigation'],
        videoSelectors: ['video', '.html5-video-player video'],
        skipIntroSelector: '.ytp-skip-ad-button',
        maxRecommendedSpeed: 2.5
      }
    };

    return this.educationalPlatform ? configs[this.educationalPlatform] : null;
  }

  setupEducationalFeatures() {
    if (!this.platformConfig) return;

    console.log(`Educational platform detected: ${this.platformConfig.name}`);
    
    // Apply platform-specific default speed
    if (this.platformConfig.defaultSpeed && this.currentSpeed === 1.0) {
      setTimeout(() => {
        this.setSpeed(this.platformConfig.defaultSpeed);
        this.showEducationalMessage(`Optimized for ${this.platformConfig.name} learning`);
      }, 2000);
    }

    // Setup platform-specific features
    this.setupAutoSkipIntro();
    this.setupLectureNavigation();
    this.setupNoteTimestamps();
  }

  setupAutoSkipIntro() {
    if (!this.platformConfig.features.includes('autoSkipIntro')) return;

    const observer = new MutationObserver(() => {
      const skipButton = document.querySelector(this.platformConfig.skipIntroSelector);
      if (skipButton && skipButton.offsetParent !== null) {
        setTimeout(() => {
          skipButton.click();
          console.log('Auto-skipped intro/ad');
        }, 1000);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  setupLectureNavigation() {
    if (!this.platformConfig.features.includes('chapterNavigation')) return;

    // Add keyboard shortcuts for lecture navigation
    document.addEventListener('keydown', (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

      // Ctrl + Left Arrow - Previous lecture/chapter
      if (event.ctrlKey && event.code === 'ArrowLeft') {
        event.preventDefault();
        this.navigateLecture('previous');
      }

      // Ctrl + Right Arrow - Next lecture/chapter
      if (event.ctrlKey && event.code === 'ArrowRight') {
        event.preventDefault();
        this.navigateLecture('next');
      }
    });
  }

  navigateLecture(direction) {
    const selectors = {
      coursera: {
        next: '.rc-NavigationControls button[data-track-component="next_item_button"]',
        previous: '.rc-NavigationControls button[data-track-component="previous_item_button"]'
      },
      udemy: {
        next: '.next-btn, .curriculum-item-link--next',
        previous: '.prev-btn, .curriculum-item-link--previous'
      },
      khanacademy: {
        next: '.next-button, [data-test-id="next-button"]',
        previous: '.previous-button, [data-test-id="previous-button"]'
      },
      apnacollege: {
        next: '.next-lecture, .next-video',
        previous: '.prev-lecture, .prev-video'
      }
    };

    const platformSelectors = selectors[this.educationalPlatform];
    if (platformSelectors) {
      const button = document.querySelector(platformSelectors[direction]);
      if (button) {
        button.click();
        this.showEducationalMessage(`${direction === 'next' ? 'Next' : 'Previous'} lecture`);
      }
    }
  }

  setupNoteTimestamps() {
    if (!this.platformConfig.features.includes('noteTimestamps')) return;

    // Add keyboard shortcut for timestamped notes
    document.addEventListener('keydown', (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

      // Ctrl + N - Add timestamped note
      if (event.ctrlKey && event.code === 'KeyN') {
        event.preventDefault();
        this.addTimestampedNote();
      }
    });
  }

  addTimestampedNote() {
    const video = Array.from(this.videos)[0];
    if (!video) return;

    const currentTime = Math.floor(video.currentTime);
    const minutes = Math.floor(currentTime / 60);
    const seconds = currentTime % 60;
    const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const noteText = `[${timestamp}] Note: `;
    
    // Try to copy to clipboard
    navigator.clipboard.writeText(noteText).then(() => {
      this.showEducationalMessage(`Timestamp ${timestamp} copied to clipboard`);
    }).catch(() => {
      this.showEducationalMessage(`Timestamp: ${timestamp}`);
    });
  }

  showEducationalMessage(message) {
    // Create educational-specific message display
    const eduMessage = document.createElement('div');
    eduMessage.style.cssText = `
      position: fixed !important;
      top: 70px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      padding: 8px 16px !important;
      border-radius: 20px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      z-index: 2147483646 !important;
      opacity: 0 !important;
      transition: all 0.3s ease !important;
      pointer-events: none !important;
      backdrop-filter: blur(10px) !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2) !important;
    `;
    
    eduMessage.textContent = message;
    document.body.appendChild(eduMessage);
    
    // Animate in
    setTimeout(() => {
      eduMessage.style.opacity = '1';
    }, 100);
    
    // Remove after delay
    setTimeout(() => {
      eduMessage.style.opacity = '0';
      setTimeout(() => {
        if (eduMessage.parentNode) {
          eduMessage.parentNode.removeChild(eduMessage);
        }
      }, 300);
    }, 3000);
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
          isEnabled: this.isEnabled,
          educationalPlatform: this.educationalPlatform,
          platformConfig: this.platformConfig
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
        
      case 'updateShortcuts':
        this.shortcuts = message.shortcuts;
        sendResponse({ success: true, shortcuts: this.shortcuts });
        break;
        
      case 'applyEducationalSpeed':
        if (this.platformConfig && this.platformConfig.recommendedSpeeds.includes(message.speed)) {
          this.setSpeed(message.speed);
          sendResponse({ success: true, currentSpeed: this.currentSpeed });
        } else {
          sendResponse({ success: false, error: 'Speed not recommended for this platform' });
        }
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