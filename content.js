// Enhanced version with improved compatibility and features

var regStrip = /^[\r\t\f\v ]+|[\r\t\f\v ]+$/gm;

var tc = {
  settings: {
    lastSpeed: 1.0,
    enabled: true,
    speeds: {},
    rememberSpeed: false,
    audioBoolean: false,
    startHidden: false,
    controllerOpacity: 0.3,
    keyBindings: [],
    blacklist: `\
      imgur.com
      teams.microsoft.com
      `.replace(regStrip, "")
  }
};

class VideoSpeedController {
  constructor() {
    this.instanceId = Math.random().toString(36).substr(2, 9);
    this.videos = new Set();
    this.currentSpeed = 1.0;
    this.isEnabled = true;
    this.domain = window.location.hostname;
    this.speedDisplay = null;
    this.displayTimeout = null;
    this.maxSpeed = 4.0;
    this.shortcuts = {
      increase: { key: 'Period', shift: true, ctrl: false, alt: false },
      decrease: { key: 'Comma', shift: true, ctrl: false, alt: false },
      reset: { key: 'KeyR', shift: true, ctrl: false, alt: false }
    };
    this.educationalPlatform = this.detectEducationalPlatform();
    this.platformConfig = this.getPlatformConfig();
    this.controllers = new Map(); // Track visual controllers
    
    console.log(`[VideoSpeedController-${this.instanceId}] Initializing on ${this.domain}`);
    console.log(`[VideoSpeedController-${this.instanceId}] Educational platform:`, this.educationalPlatform);
    this.init();
  }

  init() {
    // Load enhanced settings first
    this.loadEnhancedSettings();
    this.setupVideoObserver();
    this.setupEnhancedKeyboardShortcuts();
    this.createSpeedDisplay();
    this.findExistingVideos();
    this.setupDisplayProtection();
    this.setupEducationalFeatures();
    
    // Update badge on initialization
    setTimeout(() => {
      this.updateBadge();
    }, 1000);
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });
  }

  async loadEnhancedSettings() {
    try {
      // Load enhanced settings with defaults
      const result = await chrome.storage.sync.get({
        persistenceEnabled: true,
        globalEnabled: true,
        maxSpeed: 4.0,
        shortcuts: this.shortcuts,
        rememberSpeed: false,
        audioBoolean: false,
        startHidden: false,
        controllerOpacity: 0.3,
        keyBindings: [
          { action: "slower", key: 83, value: 0.25, force: false, predefined: true }, // S
          { action: "faster", key: 68, value: 0.25, force: false, predefined: true }, // D
          { action: "rewind", key: 90, value: 10, force: false, predefined: true }, // Z
          { action: "forward", key: 88, value: 10, force: false, predefined: true }, // X
          { action: "fast", key: 71, value: 5, force: false, predefined: true }, // G
          { action: "reset", key: 82, value: 1.0, force: false, predefined: true }, // R
          { action: "display", key: 86, value: 0, force: false, predefined: true }, // V
          { action: "muted", key: 77, value: 0, force: false, predefined: false } // M
        ],
        blacklist: tc.settings.blacklist,
        [`speed_${this.domain}`]: this.currentSpeed
      });
      
      // Update tc.settings with loaded values
      tc.settings = { ...tc.settings, ...result };
      
      this.isEnabled = result.globalEnabled !== false;
      this.maxSpeed = result.maxSpeed || 4.0;
      console.log(`[VideoSpeedController] Loaded maxSpeed: ${this.maxSpeed}`);
      
      // Load custom shortcuts (maintain backward compatibility)
      if (result.shortcuts) {
        this.shortcuts = result.shortcuts;
      }
      
      const savedSpeed = result[`speed_${this.domain}`];
      
      if (result.persistenceEnabled !== false && savedSpeed) {
        this.currentSpeed = savedSpeed;
        tc.settings.lastSpeed = savedSpeed;
        this.applySpeedToAllVideos();
        this.updateBadge();
      }
    } catch (error) {
      console.log('VideoSpeedController: Error loading settings:', error);
    }
  }

  setupVideoObserver() {
    // Enhanced observer with better performance and shadow DOM support
    const observer = new MutationObserver((mutations) => {
      // Process DOM changes lazily for better performance
      requestIdleCallback(() => {
        mutations.forEach((mutation) => {
          switch (mutation.type) {
            case "childList":
              mutation.addedNodes.forEach((node) => {
                if (typeof node === "function") return;
                this.checkForVideo(node, node.parentNode || mutation.target, true);
              });
              mutation.removedNodes.forEach((node) => {
                if (typeof node === "function") return;
                this.checkForVideo(node, node.parentNode || mutation.target, false);
              });
              break;
            case "attributes":
              if (
                mutation.target.attributes["aria-hidden"] &&
                mutation.target.attributes["aria-hidden"].value == "false"
              ) {
                const flattenedNodes = this.getShadowElements(document.body);
                const video = flattenedNodes.filter(x => x.tagName == "VIDEO")[0];
                if (video) {
                  const oldController = flattenedNodes.filter(x =>
                    x.classList && x.classList.contains("vsc-controller")
                  )[0];
                  if (oldController) {
                    oldController.remove();
                  }
                  this.checkForVideo(video, video.parentNode || mutation.target, true);
                }
              }
              break;
          }
        });
      }, { timeout: 1000 });
    });

    observer.observe(document, {
      attributeFilter: ["aria-hidden"],
      childList: true,
      subtree: true
    });
  }

  findExistingVideos() {
    // Find videos in main document and shadow DOMs
    const mediaTags = tc.settings.audioBoolean ? 
      document.querySelectorAll("video,audio") : 
      document.querySelectorAll("video");
    
    console.log(`[VideoSpeedController-${this.instanceId}] Found ${mediaTags.length} video elements`);
    
    mediaTags.forEach((video, index) => {
      console.log(`[VideoSpeedController-${this.instanceId}] Processing video ${index + 1}:`, video.src || video.currentSrc || 'no src');
      this.addVideoController(video);
    });

    // Also check iframes
    const frameTags = document.getElementsByTagName("iframe");
    Array.from(frameTags).forEach(frame => {
      try {
        const childDocument = frame.contentDocument;
        if (childDocument) {
          this.initializeFrameDocument(childDocument);
        }
      } catch (e) {
        // Ignore cross-origin frames
      }
    });
  }

  // Enhanced shadow DOM traversal
  getShadowElements(parent) {
    let result = [];
    const self = this;
    
    function getChild(parent) {
      if (parent.firstElementChild) {
        let child = parent.firstElementChild;
        do {
          result.push(child);
          getChild(child);
          if (child.shadowRoot) {
            result.push(...self.getShadowElements(child.shadowRoot));
          }
          child = child.nextElementSibling;
        } while (child);
      }
    }
    
    getChild(parent);
    return result.flat(Infinity);
  }

  checkForVideo(node, parent, added) {
    // Only proceed with removal if node is missing from DOM
    if (!added && document.body.contains(node)) {
      return;
    }
    
    if (
      node.nodeName === "VIDEO" ||
      (node.nodeName === "AUDIO" && tc.settings.audioBoolean)
    ) {
      if (added) {
        this.addVideoController(node, parent);
      } else {
        let id = node.dataset["vscid"];
        if (id && node.vsc) {
          node.vsc.remove();
        }
      }
    } else if (node.children != undefined) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        this.checkForVideo(child, child.parentNode || parent, added);
      }
    }
  }

  addVideoController(video, parent) {
    if (video.dataset["vscid"]) {
      console.log(`[VideoSpeedController-${this.instanceId}] Video already has controller`);
      return video.vsc;
    }

    console.log(`[VideoSpeedController-${this.instanceId}] Adding controller to video:`, video);
    this.videos.add(video);
    
    // Create enhanced video controller
    const controller = new EnhancedVideoController(video, parent || video.parentElement, this);
    video.vsc = controller;
    this.controllers.set(video, controller);
    
    // Apply current speed if enabled
    if (this.isEnabled) {
      video.playbackRate = this.currentSpeed;
      console.log(`[VideoSpeedController-${this.instanceId}] Applied speed ${this.currentSpeed} to video`);
    }
    
    return controller;
  }

  initializeFrameDocument(document) {
    if (!document.body || document.body.classList.contains("vsc-initialized")) {
      return;
    }
    document.body.classList.add("vsc-initialized");

    // Add CSS for iframe
    const link = document.createElement("link");
    link.href = chrome.runtime.getURL("inject.css");
    link.type = "text/css";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }

  setupEnhancedKeyboardShortcuts() {
    const docs = [document];
    try {
      if (this.inIframe()) docs.push(window.top.document);
    } catch (e) {}

    docs.forEach(doc => {
      doc.addEventListener('keydown', (event) => {
        const keyCode = event.keyCode;

        // Ignore if modifier keys are active (except Shift for legacy shortcuts)
        if (
          !event.getModifierState ||
          event.getModifierState("Alt") ||
          event.getModifierState("Control") ||
          event.getModifierState("Fn") ||
          event.getModifierState("Meta") ||
          event.getModifierState("Hyper") ||
          event.getModifierState("OS")
        ) {
          // Still check for legacy shortcuts with modifiers
          if (this.matchesShortcut(event, this.shortcuts.increase)) {
            event.preventDefault();
            console.log(`[VideoSpeedController] Legacy shortcut: Shift+> -> faster with value 0.25, maxSpeed: ${this.maxSpeed}`);
            this.runAction('faster', 0.25);
          } else if (this.matchesShortcut(event, this.shortcuts.decrease)) {
            event.preventDefault();
            console.log(`[VideoSpeedController] Legacy shortcut: Shift+< -> slower with value 0.25, maxSpeed: ${this.maxSpeed}`);
            this.runAction('slower', 0.25);
          } else if (this.matchesShortcut(event, this.shortcuts.reset)) {
            event.preventDefault();
            console.log(`[VideoSpeedController] Legacy shortcut: Shift+R -> reset with value 1.0, maxSpeed: ${this.maxSpeed}`);
            this.runAction('reset', 1.0);
          }
          return;
        }

        // Only handle shortcuts when not typing in input fields
        if (event.target.tagName === 'INPUT' || 
            event.target.tagName === 'TEXTAREA' || 
            event.target.isContentEditable) {
          return false;
        }

        // Ignore if no video controllers present
        if (!this.getShadowElements(document.body).filter(x => 
          x.classList && x.classList.contains("vsc-controller")).length) {
          return false;
        }

        // Check enhanced key bindings
        const item = tc.settings.keyBindings.find(item => item.key === keyCode);
        if (item) {
          console.log(`[VideoSpeedController] Enhanced shortcut: ${String.fromCharCode(keyCode)} (${keyCode}) -> ${item.action} with value ${item.value}, maxSpeed: ${this.maxSpeed}`);
          this.runAction(item.action, item.value);
          if (item.force === "true") {
            event.preventDefault();
            event.stopPropagation();
          }
        }

        return false;
      }, true);
    });
  }

  matchesShortcut(event, shortcut) {
    return event.code === shortcut.key &&
           event.shiftKey === shortcut.shift &&
           event.ctrlKey === shortcut.ctrl &&
           event.altKey === shortcut.alt;
  }

  inIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  runAction(action, value, targetElement = null) {
    // Sync current speed before any speed-related actions
    if (action === 'faster' || action === 'slower' || action === 'reset' || action === 'fast') {
      this.syncCurrentSpeed();
    }

    const mediaTags = tc.settings.audioBoolean ? 
      this.getShadowElements(document.body).filter(x => x.tagName == "AUDIO" || x.tagName == "VIDEO") :
      this.getShadowElements(document.body).filter(x => x.tagName == "VIDEO");

    // Get the controller that was used if called from a button press
    let targetController = null;
    if (targetElement) {
      targetController = targetElement.getRootNode().host;
    }

    mediaTags.forEach(video => {
      const id = video.dataset["vscid"];
      const controller = this.getController(id);
      
      // Don't change video speed if the video has a different controller
      if (targetElement && !(targetController == controller)) {
        return;
      }

      // Controller may have been removed by the site, guard to prevent crashes
      if (controller) {
        this.showController(controller);
      }

      if (!video.classList.contains("vsc-cancelled")) {
        this.executeAction(action, value, video, controller);
      }
    });
  }

  executeAction(action, value, video, controller) {
    switch (action) {
      case "rewind":
        video.currentTime -= value;
        break;
      case "forward":
        video.currentTime += value;
        break;
      case "faster":
        // Ensure we're using the most current speed from the actual video
        const currentVideoSpeed = video.playbackRate || this.currentSpeed;
        this.currentSpeed = currentVideoSpeed; // Sync the global state
        console.log(`[VideoSpeedController] Faster action: video=${currentVideoSpeed}, global=${this.currentSpeed}, value=${value}, maxSpeed=${this.maxSpeed}`);
        const fasterSpeed = Math.min(
          (currentVideoSpeed < 0.1 ? 0.0 : currentVideoSpeed) + value,
          this.maxSpeed
        );
        console.log(`[VideoSpeedController] Calculated faster speed: ${fasterSpeed}`);
        this.setSpeed(Number(fasterSpeed.toFixed(2)));
        break;
      case "slower":
        // Ensure we're using the most current speed from the actual video
        const currentVideoSpeedSlow = video.playbackRate || this.currentSpeed;
        this.currentSpeed = currentVideoSpeedSlow; // Sync the global state
        console.log(`[VideoSpeedController] Slower action: video=${currentVideoSpeedSlow}, global=${this.currentSpeed}, value=${value}`);
        const slowerSpeed = Math.max(currentVideoSpeedSlow - value, 0.07);
        console.log(`[VideoSpeedController] Calculated slower speed: ${slowerSpeed}`);
        this.setSpeed(Number(slowerSpeed.toFixed(2)));
        break;
      case "reset":
        this.setSpeed(1.0);
        break;
      case "fast":
        this.setSpeed(value);
        break;
      case "display":
        if (controller) {
          controller.classList.add("vsc-manual");
          controller.classList.toggle("vsc-hidden");
        }
        break;
      case "pause":
        if (video.paused) {
          video.play();
        } else {
          video.pause();
        }
        break;
      case "muted":
        video.muted = !video.muted;
        break;
      case "mark":
        if (video.vsc) {
          video.vsc.mark = video.currentTime;
        }
        break;
      case "jump":
        if (video.vsc && video.vsc.mark && typeof video.vsc.mark === "number") {
          video.currentTime = video.vsc.mark;
        }
        break;
      case "blink":
        if (controller && (controller.classList.contains("vsc-hidden") || controller.blinkTimeOut !== undefined)) {
          clearTimeout(controller.blinkTimeOut);
          controller.classList.remove("vsc-hidden");
          controller.blinkTimeOut = setTimeout(() => {
            controller.classList.add("vsc-hidden");
            controller.blinkTimeOut = undefined;
          }, value || 1000);
        }
        break;
    }
  }

  resetSpeed(video, target) {
    if (this.currentSpeed === target) {
      if (this.currentSpeed === this.getKeyBindingValue("reset")) {
        if (target !== 1.0) {
          this.setSpeed(1.0);
        } else {
          this.setSpeed(this.getKeyBindingValue("fast"));
        }
      } else {
        this.setSpeed(this.getKeyBindingValue("reset"));
      }
    } else {
      this.setKeyBindingValue("reset", this.currentSpeed);
      this.setSpeed(target);
    }
  }

  getKeyBindingValue(action) {
    try {
      return tc.settings.keyBindings.find(item => item.action === action).value;
    } catch (e) {
      return action === "fast" ? 1.8 : 1.0;
    }
  }

  setKeyBindingValue(action, value) {
    const binding = tc.settings.keyBindings.find(item => item.action === action);
    if (binding) {
      binding.value = value;
    }
  }

  getController(id) {
    return this.getShadowElements(document.body).filter(x => {
      return (
        x.attributes && x.attributes["data-vscid"] &&
        x.tagName == "DIV" &&
        x.attributes["data-vscid"].value == `${id}`
      );
    })[0];
  }

  showController(controller) {
    controller.classList.add("vcs-show");

    if (controller.animationTimer) clearTimeout(controller.animationTimer);

    controller.animationTimer = setTimeout(() => {
      controller.classList.remove("vcs-show");
      controller.animationTimer = null;
    }, 2000);
  }

  toggleVisualControllers(show) {
    console.log(`[VideoSpeedController-${this.instanceId}] toggleVisualControllers called with show=${show}`);
    
    let controllersFound = 0;
    
    // Method 1: Use tracked controllers from this instance
    this.controllers.forEach((controller, video) => {
      if (controller.div) {
        console.log(`Found tracked controller for video:`, video.src || video.currentSrc);
        if (show) {
          controller.div.classList.remove("vsc-hidden");
          controller.div.classList.add("vsc-manual");
          controller.div.style.display = "block";
        } else {
          controller.div.classList.add("vsc-hidden");
          controller.div.classList.remove("vsc-manual");
        }
        controllersFound++;
      }
    });
    
    // Method 2: Find controllers using document.querySelectorAll (fallback)
    const domControllers = document.querySelectorAll('.vsc-controller');
    console.log(`Found ${domControllers.length} controllers via querySelectorAll`);
    
    domControllers.forEach(controller => {
      if (show) {
        controller.classList.remove("vsc-hidden");
        controller.classList.add("vsc-manual");
        controller.style.display = "block";
      } else {
        controller.classList.add("vsc-hidden");
        controller.classList.remove("vsc-manual");
      }
      controllersFound++;
    });
    
    // Method 3: Try shadow DOM traversal as backup
    try {
      const shadowControllers = this.getShadowElements(document.body).filter(x => 
        x.classList && x.classList.contains("vsc-controller"));
      console.log(`Found ${shadowControllers.length} controllers via shadow DOM`);
      
      shadowControllers.forEach(controller => {
        if (show) {
          controller.classList.remove("vsc-hidden");
          controller.classList.add("vsc-manual");
          controller.style.display = "block";
        } else {
          controller.classList.add("vsc-hidden");
          controller.classList.remove("vsc-manual");
        }
        controllersFound++;
      });
    } catch (error) {
      console.log('Shadow DOM traversal failed:', error);
    }
    
    // Update the global setting
    tc.settings.startHidden = !show;
    
    console.log(`[VideoSpeedController-${this.instanceId}] Visual controllers ${show ? 'shown' : 'hidden'}: ${controllersFound} controllers affected`);
    console.log(`[VideoSpeedController-${this.instanceId}] Current tc.settings.startHidden:`, tc.settings.startHidden);
  }

  increaseSpeed() {
    const newSpeed = Math.min(this.maxSpeed, this.currentSpeed + 0.25);
    this.setSpeed(newSpeed);
  }

  decreaseSpeed() {
    const newSpeed = Math.max(0.25, this.currentSpeed - 0.25);
    this.setSpeed(newSpeed);
  }

  syncCurrentSpeed() {
    // Sync currentSpeed with the actual video playback rates
    if (this.videos.size > 0) {
      const firstVideo = Array.from(this.videos)[0];
      if (firstVideo && firstVideo.playbackRate) {
        const videoSpeed = firstVideo.playbackRate;
        if (Math.abs(videoSpeed - this.currentSpeed) > 0.01) {
          console.log(`[VideoSpeedController] Syncing currentSpeed from ${this.currentSpeed} to ${videoSpeed}`);
          this.currentSpeed = parseFloat(videoSpeed.toFixed(2));
        }
      }
    }
  }

  setSpeed(speed) {
    this.currentSpeed = parseFloat(speed.toFixed(2));
    this.applySpeedToAllVideos();
    this.showSpeedDisplay();
    this.saveSpeed();
    this.updateBadge();
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

  updateBadge() {
    try {
      // Send message to background script to update badge
      chrome.runtime.sendMessage({
        action: 'updateBadge',
        speed: this.currentSpeed
      }).catch(error => {
        // Ignore errors if background script is not ready
        console.log('Badge update failed (background script not ready):', error);
      });
    } catch (error) {
      console.log('VideoSpeedController: Error updating badge:', error);
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
          controllerCount: this.controllers.size,
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
        console.log(`[VideoSpeedController] Updating maxSpeed from ${this.maxSpeed} to ${message.maxSpeed}`);
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

      case 'updateEnhancedSetting':
        console.log(`[VideoSpeedController-${this.instanceId}] Updating enhanced setting: ${message.setting} = ${message.value}`);
        console.log(`[VideoSpeedController-${this.instanceId}] Current controllers count: ${this.controllers.size}`);
        console.log(`[VideoSpeedController-${this.instanceId}] Current videos count: ${this.videos.size}`);
        
        tc.settings[message.setting] = message.value;
        
        // Handle specific settings that need immediate action
        if (message.setting === 'startHidden') {
          // startHidden = true means controllers should be hidden
          // startHidden = false means controllers should be visible
          const shouldShow = !message.value;
          console.log(`[VideoSpeedController-${this.instanceId}] Visual controller toggle: startHidden=${message.value}, shouldShow=${shouldShow}`);
          this.toggleVisualControllers(shouldShow);
        }
        
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  }
}

// Enhanced Video Controller Class
class EnhancedVideoController {
  constructor(target, parent, mainController) {
    this.video = target;
    this.parent = parent;
    this.document = target.ownerDocument;
    this.mainController = mainController;
    this.id = Math.random().toString(36).substr(2, 9);
    this.speed = 1.0;

    // Set up speed tracking
    if (!tc.settings.rememberSpeed) {
      if (!tc.settings.speeds[target.currentSrc]) {
        tc.settings.speeds[target.currentSrc] = this.speed;
      }
      mainController.setKeyBindingValue("reset", mainController.getKeyBindingValue("fast"));
    } else {
      tc.settings.speeds[target.currentSrc] = tc.settings.lastSpeed;
    }

    target.playbackRate = tc.settings.speeds[target.currentSrc];
    this.div = this.initializeControls();

    // Event listeners
    target.addEventListener("play", this.handlePlay.bind(this));
    target.addEventListener("ratechange", this.handleRatechange.bind(this));

    // Observer for src changes
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "src" || mutation.attributeName === "currentSrc")
        ) {
          const controller = mainController.getController(this.id);
          if (!controller) return;
          
          if (!mutation.target.src && !mutation.target.currentSrc) {
            controller.classList.add("vsc-nosource");
          } else {
            controller.classList.remove("vsc-nosource");
          }
        }
      });
    });
    observer.observe(target, { attributeFilter: ["src", "currentSrc"] });
  }

  handlePlay(event) {
    if (!tc.settings.rememberSpeed) {
      if (!tc.settings.speeds[this.video.currentSrc]) {
        tc.settings.speeds[this.video.currentSrc] = this.speed;
      }
      this.mainController.setKeyBindingValue("reset", this.mainController.getKeyBindingValue("fast"));
    } else {
      tc.settings.speeds[this.video.currentSrc] = tc.settings.lastSpeed;
    }
    this.video.playbackRate = tc.settings.speeds[this.video.currentSrc];
  }

  handleRatechange(event) {
    if (event.target.readyState > 0) {
      const speed = this.getSpeed();
      const speedFloat = parseFloat(speed);
      
      if (this.speedIndicator) {
        this.speedIndicator.textContent = speed;
      }
      tc.settings.speeds[this.video.currentSrc] = speedFloat;
      tc.settings.lastSpeed = speedFloat;
      this.speed = speedFloat;
      
      // Update main controller immediately and synchronously
      this.mainController.currentSpeed = speedFloat;
      console.log(`[VideoSpeedController] Rate change: Updated currentSpeed to ${speedFloat}`);
      
      // Save to storage (both lastSpeed and domain-specific speed)
      const domain = window.location.hostname;
      chrome.storage.sync.set({ 
        lastSpeed: speedFloat,
        [`speed_${domain}`]: speedFloat
      });
      
      this.mainController.updateBadge();
      this.mainController.showSpeedDisplay();
      
      // Show controller briefly
      this.mainController.runAction("blink", 1000);
    }
  }

  getSpeed() {
    return parseFloat(this.video.playbackRate).toFixed(2);
  }

  remove() {
    if (this.div) this.div.remove();
    this.video.removeEventListener("play", this.handlePlay);
    this.video.removeEventListener("ratechange", this.handleRatechange);
    delete this.video.dataset["vscid"];
    delete this.video.vsc;
  }

  initializeControls() {
    console.log('Initializing visual controller for video:', this.video.src || this.video.currentSrc);
    const speed = parseFloat(tc.settings.speeds[this.video.currentSrc] || 1.0).toFixed(2);
    const top = Math.max(this.video.offsetTop, 0) + "px";
    const left = Math.max(this.video.offsetLeft, 0) + "px";

    const wrapper = document.createElement("div");
    wrapper.classList.add("vsc-controller");
    wrapper.dataset["vscid"] = this.id;
    console.log('Created wrapper with ID:', this.id);

    if (!this.video.currentSrc) {
      wrapper.classList.add("vsc-nosource");
    }

    if (tc.settings.startHidden) {
      wrapper.classList.add("vsc-hidden");
    }

    const shadow = wrapper.attachShadow({ mode: "open" });
    const shadowTemplate = `
      <style>
        * {
          line-height: 1.8em;
          font-family: Verdana, Geneva, sans-serif;
          font-size: 13px;
        }
        :host(:hover) #controls {
          display: inline;
        }
        #controller {
          position: absolute;
          top: ${top};
          left: ${left};
          background: black;
          color: white;
          border-radius: 5px;
          padding: 5px;
          margin: 10px 10px 10px 15px;
          cursor: default;
          z-index: 9999999;
          opacity: ${tc.settings.controllerOpacity};
        }
        #controller:hover {
          opacity: 0.7;
        }
        #controller:hover > .draggable {
          margin-right: 0.8em;
        }
        #controls {
          display: none;
        }
        #controller.dragging {
          cursor: -webkit-grabbing;
          opacity: 0.7;
        }
        #controller.dragging #controls {
          display: inline;
        }
        .draggable {
          cursor: -webkit-grab;
        }
        .draggable:active {
          cursor: -webkit-grabbing;
        }
        button {
          cursor: pointer;
          color: black;
          background: white;
          font-weight: bold;
          border-radius: 5px;
          padding: 1px 6px 3px 6px;
          font-size: 14px;
          line-height: 14px;
          border: 1px solid white;
          font-family: "Lucida Console", Monaco, monospace;
          margin-bottom: 2px;
        }
        button:focus { outline: 0; }
        button:hover { opacity: 1; }
        button:active { background: #ccc; }
        button.rw { opacity: 0.65; }
        button.hideButton { margin-right: 2px; opacity: 0.5; }
      </style>
      <div id="controller">
        <span data-action="drag" class="draggable">${speed}</span>
        <span id="controls">
          <button data-action="rewind" class="rw">«</button>
          <button data-action="slower">-</button>
          <button data-action="faster">+</button>
          <button data-action="forward" class="rw">»</button>
          <button data-action="display" class="hideButton">x</button>
        </span>
      </div>
    `;
    shadow.innerHTML = shadowTemplate;
    console.log('Shadow DOM created, buttons found:', shadow.querySelectorAll("button").length);

    // Event listeners for controls
    shadow.querySelector(".draggable").addEventListener("mousedown", e => {
      this.handleDrag(e);
    });

    shadow.querySelectorAll("button").forEach(button => {
      console.log('Adding event listener to button:', button.dataset["action"]);
      
      // Use addEventListener instead of onclick for better reliability
      button.addEventListener('click', (e) => {
        console.log('Button clicked:', e.target.dataset["action"]);
        const action = e.target.dataset["action"];
        let value;
        
        // Use specific increment values for visual controller buttons
        if (action === "faster") {
          value = 0.25; // Increase by 0.25
          console.log('Faster button clicked, value:', value);
        } else if (action === "slower") {
          value = 0.25; // Decrease by 0.25
          console.log('Slower button clicked, value:', value);
        } else if (action === "display") {
          console.log('Display/Hide button clicked');
          value = this.mainController.getKeyBindingValue(action);
        } else {
          value = this.mainController.getKeyBindingValue(action);
        }
        
        console.log('Running action:', action, 'with value:', value);
        this.mainController.runAction(action, value, e.target);
        
        // Prevent event bubbling
        e.preventDefault();
        e.stopPropagation();
      }, true); // Use capture phase
    });

    this.speedIndicator = shadow.querySelector("span");
    const fragment = document.createDocumentFragment();
    fragment.appendChild(wrapper);

    this.video.dataset["vscid"] = this.id;

    // Site-specific positioning
    switch (true) {
      case location.hostname == "www.amazon.com":
      case location.hostname == "www.reddit.com":
      case /hbogo\./.test(location.hostname):
        this.parent.parentElement.insertBefore(fragment, this.parent);
        console.log('Controller attached to parent.parentElement');
        break;
      case location.hostname == "tv.apple.com":
        this.parent.getRootNode().querySelector(".scrim")?.prepend(fragment);
        console.log('Controller attached to Apple TV scrim');
        break;
      default:
        this.parent.insertBefore(fragment, this.parent.firstChild);
        console.log('Controller attached to parent as first child');
    }

    console.log('Visual controller fully initialized and attached to DOM');
    return wrapper;
  }

  handleDrag(e) {
    const shadowController = this.div.shadowRoot.querySelector("#controller");
    let parentElement = this.div.parentElement;
    
    // Find nearest parent of same size as video parent
    while (
      parentElement.parentNode &&
      parentElement.parentNode.offsetHeight === parentElement.offsetHeight &&
      parentElement.parentNode.offsetWidth === parentElement.offsetWidth
    ) {
      parentElement = parentElement.parentNode;
    }

    this.video.classList.add("vcs-dragging");
    shadowController.classList.add("dragging");

    const initialMouseXY = [e.clientX, e.clientY];
    const initialControllerXY = [
      parseInt(shadowController.style.left),
      parseInt(shadowController.style.top)
    ];

    const startDragging = e => {
      const dx = e.clientX - initialMouseXY[0];
      const dy = e.clientY - initialMouseXY[1];
      shadowController.style.left = initialControllerXY[0] + dx + "px";
      shadowController.style.top = initialControllerXY[1] + dy + "px";
    };

    const stopDragging = () => {
      parentElement.removeEventListener("mousemove", startDragging);
      parentElement.removeEventListener("mouseup", stopDragging);
      parentElement.removeEventListener("mouseleave", stopDragging);
      shadowController.classList.remove("dragging");
      this.video.classList.remove("vcs-dragging");
    };

    parentElement.addEventListener("mouseup", stopDragging);
    parentElement.addEventListener("mouseleave", stopDragging);
    parentElement.addEventListener("mousemove", startDragging);
  }
}

// Check blacklist before initializing
function checkBlacklist() {
  let blacklisted = false;
  tc.settings.blacklist.split("\n").forEach(match => {
    match = match.replace(regStrip, "");
    if (match.length == 0) return;

    let regexp;
    if (match.startsWith("/")) {
      try {
        regexp = new RegExp(match);
      } catch (err) {
        return;
      }
    } else {
      regexp = new RegExp(match.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&"));
    }

    if (regexp.test(location.href)) {
      blacklisted = true;
    }
  });
  return blacklisted;
}

// Initialize the enhanced controller
function initializeVideoSpeedController() {
  console.log('VideoSpeedController: Initializing...');
  
  // Check if site is blacklisted
  chrome.storage.sync.get(tc.settings, function(storage) {
    console.log('VideoSpeedController: Storage loaded:', storage);
    tc.settings = { ...tc.settings, ...storage };
    
    if (checkBlacklist()) {
      console.log('VideoSpeedController: Site is blacklisted');
      return;
    }

    if (!tc.settings.enabled) {
      console.log('VideoSpeedController: Extension is disabled');
      return;
    }

    // Prevent double initialization
    if (document.body && document.body.classList.contains("vsc-initialized")) {
      console.log('VideoSpeedController: Already initialized');
      return;
    }
    document.body.classList.add("vsc-initialized");

    console.log('VideoSpeedController: Creating main controller instance');
    new VideoSpeedController();
  });
}

// Initialize when ready
console.log('VideoSpeedController: Content script loaded');

if (document.readyState === 'loading') {
  console.log('VideoSpeedController: Waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', initializeVideoSpeedController);
} else {
  console.log('VideoSpeedController: DOM already ready, initializing immediately');
  initializeVideoSpeedController();
}