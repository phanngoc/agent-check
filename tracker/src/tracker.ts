import html2canvas from 'html2canvas';

interface TrackerConfig {
  apiUrl: string;
  userId?: string;
  captureScreenshots?: boolean;
  screenshotQuality?: number;
  maskSensitiveInputs?: boolean;
  batchSize?: number;
  flushInterval?: number;
  mouseMoveThrottle?: number;
  debug?: boolean;
}

interface EventData {
  timestamp: Date;
  event_type: string;
  page_url: string;
  target_element?: string;
  target_selector?: string;
  target_tag?: string;
  target_id?: string;
  target_class?: string;
  viewport_x?: number;
  viewport_y?: number;
  screen_x?: number;
  screen_y?: number;
  scroll_x?: number;
  scroll_y?: number;
  input_value?: string;
  input_masked?: boolean;
  key_pressed?: string;
  mouse_button?: number;
  click_count?: number;
  event_data?: Record<string, any>;
}

class UserTracker {
  private config: TrackerConfig & {
    captureScreenshots: boolean;
    screenshotQuality: number;
    maskSensitiveInputs: boolean;
    batchSize: number;
    flushInterval: number;
    mouseMoveThrottle: number;
    debug: boolean;
  };
  private sessionId: string | null = null;
  private eventQueue: EventData[] = [];
  private flushTimer: number | null = null;
  private lastMouseMove: number = 0;
  private lastPageUrl: string = '';
  private isCapturingScreenshot: boolean = false;
  private bugReportButton: HTMLElement | null = null;
  private bugReportPopup: HTMLElement | null = null;
  private bugReportOverlay: HTMLElement | null = null;
  private isBugReportInitialized: boolean = false;
  private currentScreenshot: string | null = null;
  private selectedFiles: File[] = [];

  constructor() {
    this.config = {
      apiUrl: '',
      userId: undefined,
      captureScreenshots: true,
      screenshotQuality: 0.8,
      maskSensitiveInputs: true,
      batchSize: 50,
      flushInterval: 5000,
      mouseMoveThrottle: 100,
      debug: false,
    };
  }

  public init(config: TrackerConfig): void {
    this.config = { ...this.config, ...config };

    if (!this.config.apiUrl) {
      console.error('[UserTracker] API URL is required');
      return;
    }

    this.log('Initializing tracker');
    this.createSession();
  }

  private async createSession(): Promise<void> {
    try {
      const sessionData = {
        user_id: this.config.userId,
        fingerprint: this.generateFingerprint(),
        page_url: window.location.href,
        referrer: document.referrer || undefined,
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        device_type: this.getDeviceType(),
        browser: this.getBrowser(),
        os: this.getOS(),
      };

      const response = await fetch(`${this.config.apiUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const data = await response.json();
      this.sessionId = data.session_id;
      this.log('Session created:', this.sessionId);

      this.startTracking();
      this.initBugReport();
    } catch (error) {
      console.error('[UserTracker] Failed to create session:', error);
    }
  }

  private startTracking(): void {
    // Track clicks
    document.addEventListener('click', this.handleClick.bind(this), true);

    // Track inputs
    document.addEventListener('input', this.handleInput.bind(this), true);
    document.addEventListener('change', this.handleChange.bind(this), true);

    // Track scrolling
    window.addEventListener('scroll', this.handleScroll.bind(this), true);

    // Track mouse movements (throttled)
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), true);

    // Track page visibility
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    // Track navigation
    window.addEventListener('popstate', this.handleNavigation.bind(this));
    this.interceptPushState();
    this.interceptReplaceState();

    // Track page resize
    window.addEventListener('resize', this.handleResize.bind(this));

    // Track page unload
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));

    // Initial screenshot
    if (this.config.captureScreenshots) {
      this.captureScreenshot();
    }

    // Start flush timer
    this.startFlushTimer();

    this.log('Tracking started');
  }

  private handleClick(event: MouseEvent): void {
    if (this.shouldIgnore(event.target as HTMLElement)) return;

    const target = event.target as HTMLElement;
    this.queueEvent({
      timestamp: new Date(),
      event_type: 'click',
      page_url: window.location.href,
      target_element: target.outerHTML?.substring(0, 500),
      target_selector: this.getSelector(target),
      target_tag: target.tagName?.toLowerCase(),
      target_id: target.id || undefined,
      target_class: target.className || undefined,
      viewport_x: event.clientX,
      viewport_y: event.clientY,
      screen_x: event.screenX,
      screen_y: event.screenY,
      mouse_button: event.button,
      click_count: event.detail,
    });
  }

  private handleInput(event: Event): void {
    if (this.shouldIgnore(event.target as HTMLElement)) return;

    const target = event.target as HTMLInputElement;
    const isSensitive = this.config.maskSensitiveInputs && this.isSensitiveInput(target);

    this.queueEvent({
      timestamp: new Date(),
      event_type: 'input',
      page_url: window.location.href,
      target_selector: this.getSelector(target),
      target_tag: target.tagName?.toLowerCase(),
      target_id: target.id || undefined,
      target_class: target.className || undefined,
      input_value: isSensitive ? '***MASKED***' : target.value,
      input_masked: isSensitive,
    });
  }

  private handleChange(event: Event): void {
    if (this.shouldIgnore(event.target as HTMLElement)) return;

    const target = event.target as HTMLInputElement;
    this.queueEvent({
      timestamp: new Date(),
      event_type: 'change',
      page_url: window.location.href,
      target_selector: this.getSelector(target),
      target_tag: target.tagName?.toLowerCase(),
      target_id: target.id || undefined,
      input_value: target.value,
    });
  }

  private handleScroll(): void {
    this.queueEvent({
      timestamp: new Date(),
      event_type: 'scroll',
      page_url: window.location.href,
      scroll_x: window.scrollX,
      scroll_y: window.scrollY,
    });
  }

  private handleMouseMove(event: MouseEvent): void {
    const now = Date.now();
    if (now - this.lastMouseMove < this.config.mouseMoveThrottle) return;
    this.lastMouseMove = now;

    this.queueEvent({
      timestamp: new Date(),
      event_type: 'mousemove',
      page_url: window.location.href,
      viewport_x: event.clientX,
      viewport_y: event.clientY,
      screen_x: event.screenX,
      screen_y: event.screenY,
    });
  }

  private handleVisibilityChange(): void {
    this.queueEvent({
      timestamp: new Date(),
      event_type: document.hidden ? 'blur' : 'focus',
      page_url: window.location.href,
    });
  }

  private handleNavigation(): void {
    const newUrl = window.location.href;
    if (newUrl !== this.lastPageUrl) {
      this.queueEvent({
        timestamp: new Date(),
        event_type: 'navigation',
        page_url: newUrl,
        event_data: {
          from: this.lastPageUrl,
          to: newUrl,
        },
      });

      this.lastPageUrl = newUrl;

      // Capture screenshot on page change
      if (this.config.captureScreenshots) {
        this.captureScreenshot();
      }
    }
  }

  private handleResize(): void {
    this.queueEvent({
      timestamp: new Date(),
      event_type: 'resize',
      page_url: window.location.href,
      event_data: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
  }

  private handleBeforeUnload(): void {
    this.flush();
    this.endSession();
  }

  private async captureScreenshot(): Promise<void> {
    if (this.isCapturingScreenshot || !this.sessionId) return;

    this.isCapturingScreenshot = true;
    try {
      const canvas = await html2canvas(document.body, {
        allowTaint: true,
        useCORS: true,
        logging: false,
        width: window.innerWidth,
        height: document.documentElement.scrollHeight,
      });

      const imageData = canvas.toDataURL('image/jpeg', this.config.screenshotQuality);

      await fetch(`${this.config.apiUrl}/track/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          page_url: window.location.href,
          timestamp: new Date().toISOString(),
          image_data: imageData,
          width: canvas.width,
          height: canvas.height,
        }),
      });

      this.log('Screenshot captured');
    } catch (error) {
      console.error('[UserTracker] Failed to capture screenshot:', error);
    } finally {
      this.isCapturingScreenshot = false;
    }
  }

  private queueEvent(event: EventData): void {
    this.eventQueue.push(event);

    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0 || !this.sessionId) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const response = await fetch(`${this.config.apiUrl}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          events: events,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send events: ${response.statusText}`);
      }

      this.log(`Flushed ${events.length} events`);
    } catch (error) {
      console.error('[UserTracker] Failed to send events:', error);
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = window.setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private async endSession(): Promise<void> {
    if (!this.sessionId) return;

    try {
      await fetch(`${this.config.apiUrl}/sessions/${this.sessionId}/end`, {
        method: 'POST',
      });
      this.log('Session ended');
    } catch (error) {
      console.error('[UserTracker] Failed to end session:', error);
    }
  }

  // Helper methods
  private shouldIgnore(element: HTMLElement): boolean {
    return element?.hasAttribute('data-tracker-ignore');
  }

  private isSensitiveInput(input: HTMLInputElement): boolean {
    const type = input.type?.toLowerCase();
    const name = input.name?.toLowerCase() || '';
    const id = input.id?.toLowerCase() || '';

    const sensitiveTypes = ['password', 'email', 'tel'];
    const sensitivePatterns = ['password', 'credit', 'card', 'cvv', 'ssn', 'social'];

    if (sensitiveTypes.includes(type)) return true;

    return sensitivePatterns.some(
      (pattern) => name.includes(pattern) || id.includes(pattern)
    );
  }

  private getSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;

    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className) {
        selector += `.${current.className.split(' ').join('.')}`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  private generateFingerprint(): string {
    const components = [
      navigator.userAgent,
      navigator.language,
      window.screen.width,
      window.screen.height,
      new Date().getTimezoneOffset(),
    ];
    return btoa(components.join('|'));
  }

  private getDeviceType(): string {
    const ua = navigator.userAgent.toLowerCase();
    if (/(tablet|ipad|playbook|silk)/.test(ua)) return 'tablet';
    if (/mobile/.test(ua)) return 'mobile';
    return 'desktop';
  }

  private getBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private interceptPushState(): void {
    const original = history.pushState;
    history.pushState = (...args) => {
      original.apply(history, args);
      this.handleNavigation();
    };
  }

  private interceptReplaceState(): void {
    const original = history.replaceState;
    history.replaceState = (...args) => {
      original.apply(history, args);
      this.handleNavigation();
    };
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[UserTracker]', ...args);
    }
  }

  // Helper function to build API endpoint URL
  private buildApiUrl(endpoint: string): string {
    let baseUrl = this.config.apiUrl;
    
    // Remove trailing slash from baseUrl
    baseUrl = baseUrl.replace(/\/+$/, '');
    
    // Remove leading slash from endpoint
    endpoint = endpoint.replace(/^\/+/, '');
    
    // Check if baseUrl already includes /api/v1
    if (!baseUrl.includes('/api/v1')) {
      // If not, add /api/v1
      baseUrl = baseUrl.replace(/\/+$/, '') + '/api/v1';
    }
    
    return `${baseUrl}/${endpoint}`;
  }

  // Helper function to sanitize CSS by removing/replacing unsupported color functions
  private sanitizeCSS(cssText: string): string {
    if (!cssText) return cssText;
    
    // Remove oklch() color functions - replace with fallback rgb or remove the property
    // Pattern: oklch(...) or oklch(...) in any CSS property
    let sanitized = cssText;
    
    // Replace oklch() with a safe fallback (transparent or inherit)
    // This regex matches oklch(...) with any content inside
    sanitized = sanitized.replace(/oklch\([^)]*\)/gi, 'transparent');
    
    // Also handle other unsupported modern color functions if needed
    // lab(), lch(), color() with oklch, etc.
    sanitized = sanitized.replace(/lab\([^)]*\)/gi, 'transparent');
    sanitized = sanitized.replace(/lch\([^)]*\)/gi, 'transparent');
    sanitized = sanitized.replace(/color\([^)]*oklch[^)]*\)/gi, 'transparent');
    
    return sanitized;
  }

  // Helper function to sanitize all styles in a cloned document
  private sanitizeDocumentStyles(clonedDoc: Document): void {
    // Sanitize all style tags
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach((style) => {
      if (style.textContent) {
        const sanitized = this.sanitizeCSS(style.textContent);
        if (sanitized !== style.textContent) {
          style.textContent = sanitized;
        }
      }
    });

    // Sanitize inline styles on all elements
    const allElements = clonedDoc.querySelectorAll('*');
    allElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.style && htmlElement.style.cssText) {
        const sanitized = this.sanitizeCSS(htmlElement.style.cssText);
        if (sanitized !== htmlElement.style.cssText) {
          htmlElement.style.cssText = sanitized;
        }
      }
    });

    // Also check computed styles and remove problematic style attributes
    allElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.hasAttribute('style')) {
        const styleAttr = htmlElement.getAttribute('style');
        if (styleAttr && styleAttr.includes('oklch')) {
          const sanitized = this.sanitizeCSS(styleAttr);
          htmlElement.setAttribute('style', sanitized);
        }
      }
    });
  }

  // Bug Report Popup
  private initBugReport(): void {
    if (this.isBugReportInitialized) return;
    this.isBugReportInitialized = true;

    // Inject CSS styles
    this.injectBugReportStyles();

    // Create floating button
    this.bugReportButton = document.createElement('button');
    this.bugReportButton.setAttribute('data-tracker-ignore', 'true');
    this.bugReportButton.className = 'tracker-bug-report-btn';
    this.bugReportButton.innerHTML = '🐛';
    this.bugReportButton.title = 'Report Bug';
    this.bugReportButton.addEventListener('click', () => this.toggleBugReportPopup());
    document.body.appendChild(this.bugReportButton);

    // Create overlay
    this.bugReportOverlay = document.createElement('div');
    this.bugReportOverlay.className = 'tracker-bug-report-overlay';
    this.bugReportOverlay.addEventListener('click', () => this.closeBugReportPopup());
    document.body.appendChild(this.bugReportOverlay);

    // Create popup
    this.bugReportPopup = document.createElement('div');
    this.bugReportPopup.className = 'tracker-bug-report-popup';
    this.bugReportPopup.innerHTML = `
      <div class="tracker-bug-report-header">
        <h3>Report Bug</h3>
        <button class="tracker-bug-report-close" data-tracker-ignore="true">×</button>
      </div>
      <form class="tracker-bug-report-form" data-tracker-ignore="true">
        <div class="tracker-bug-report-field">
          <label for="tracker-bug-title">Title</label>
          <input type="text" id="tracker-bug-title" name="title" required placeholder="Brief description of the bug">
        </div>
        <div class="tracker-bug-report-field">
          <label for="tracker-bug-description">Description</label>
          <textarea id="tracker-bug-description" name="description" required rows="5" placeholder="Detailed description of the bug"></textarea>
        </div>
        <div class="tracker-bug-report-field">
          <label>Screenshot (captured automatically)</label>
          <div class="tracker-bug-report-screenshot-preview" style="display: none;">
            <img src="" alt="Screenshot preview" style="max-width: 100%; border-radius: 4px; border: 1px solid #d1d5db;">
          </div>
        </div>
        <div class="tracker-bug-report-field">
          <label for="tracker-bug-attachments">Attachments (optional)</label>
          <input type="file" id="tracker-bug-attachments" name="attachments" multiple data-tracker-ignore="true">
          <div class="tracker-bug-report-file-list" style="display: none;"></div>
        </div>
        <div class="tracker-bug-report-actions">
          <button type="button" class="tracker-bug-report-cancel" data-tracker-ignore="true">Close</button>
          <button type="submit" class="tracker-bug-report-submit" data-tracker-ignore="true">Submit</button>
        </div>
      </form>
    `;

    // Add event listeners
    const closeBtn = this.bugReportPopup.querySelector('.tracker-bug-report-close');
    const cancelBtn = this.bugReportPopup.querySelector('.tracker-bug-report-cancel');
    const form = this.bugReportPopup.querySelector('.tracker-bug-report-form') as HTMLFormElement;
    const fileInput = this.bugReportPopup.querySelector('#tracker-bug-attachments') as HTMLInputElement;

    closeBtn?.addEventListener('click', () => this.closeBugReportPopup());
    cancelBtn?.addEventListener('click', () => this.closeBugReportPopup());
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleBugReportSubmit(form);
    });
    fileInput?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        this.selectedFiles = Array.from(target.files);
        this.updateFileListDisplay();
      }
    });

    document.body.appendChild(this.bugReportPopup);
    this.closeBugReportPopup(); // Initially hidden
  }

  private injectBugReportStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .tracker-bug-report-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background-color: #ef4444;
        color: white;
        border: none;
        cursor: pointer;
        font-size: 24px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .tracker-bug-report-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      }
      .tracker-bug-report-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9999;
        display: none;
      }
      .tracker-bug-report-overlay.show {
        display: block;
      }
      .tracker-bug-report-popup {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 400px;
        max-width: calc(100vw - 40px);
        background: white;
        border-radius: 8px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        display: none;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
      }
      .tracker-bug-report-popup.show {
        display: block;
      }
      .tracker-bug-report-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
      }
      .tracker-bug-report-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #111827;
      }
      .tracker-bug-report-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #6b7280;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .tracker-bug-report-close:hover {
        color: #111827;
      }
      .tracker-bug-report-form {
        padding: 20px;
      }
      .tracker-bug-report-field {
        margin-bottom: 16px;
      }
      .tracker-bug-report-field label {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 500;
        color: #374151;
      }
      .tracker-bug-report-field input,
      .tracker-bug-report-field textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        font-family: inherit;
        box-sizing: border-box;
      }
      .tracker-bug-report-field input:focus,
      .tracker-bug-report-field textarea:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      .tracker-bug-report-field textarea {
        resize: vertical;
        min-height: 100px;
      }
      .tracker-bug-report-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 20px;
      }
      .tracker-bug-report-actions button {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: background-color 0.2s;
      }
      .tracker-bug-report-cancel {
        background-color: #f3f4f6;
        color: #374151;
      }
      .tracker-bug-report-cancel:hover {
        background-color: #e5e7eb;
      }
      .tracker-bug-report-submit {
        background-color: #3b82f6;
        color: white;
      }
      .tracker-bug-report-submit:hover {
        background-color: #2563eb;
      }
      .tracker-bug-report-submit:disabled {
        background-color: #9ca3af;
        cursor: not-allowed;
      }
      .tracker-bug-report-screenshot-preview {
        margin-top: 8px;
        padding: 8px;
        background-color: #f9fafb;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
      }
      .tracker-bug-report-screenshot-preview img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
      }
      .tracker-bug-report-field input[type="file"] {
        width: 100%;
        padding: 8px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
      }
      .tracker-bug-report-file-list {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .tracker-bug-report-file-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        background-color: #f9fafb;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
      }
      .tracker-bug-report-file-preview {
        width: 40px;
        height: 40px;
        object-fit: cover;
        border-radius: 4px;
      }
      .tracker-bug-report-file-icon {
        font-size: 24px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tracker-bug-report-file-name {
        flex: 1;
        font-size: 14px;
        color: #374151;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tracker-bug-report-file-size {
        font-size: 12px;
        color: #6b7280;
      }
      .tracker-bug-report-file-remove {
        background: none;
        border: none;
        color: #ef4444;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .tracker-bug-report-file-remove:hover {
        color: #dc2626;
      }
      @media (max-width: 480px) {
        .tracker-bug-report-popup {
          bottom: 20px;
          right: 20px;
          left: 20px;
          width: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private toggleBugReportPopup(): void {
    if (this.bugReportPopup && this.bugReportOverlay) {
      const isOpen = this.bugReportPopup.classList.contains('show');
      if (isOpen) {
        this.closeBugReportPopup();
      } else {
        this.openBugReportPopup();
      }
    }
  }

  private openBugReportPopup(): void {
    if (this.bugReportPopup && this.bugReportOverlay) {
      this.bugReportPopup.classList.add('show');
      this.bugReportOverlay.classList.add('show');
      // Reset form and state
      const form = this.bugReportPopup.querySelector('.tracker-bug-report-form') as HTMLFormElement;
      if (form) {
        form.reset();
      }
      this.selectedFiles = [];
      this.currentScreenshot = null;
      // Capture screenshot
      this.captureScreenshotForBugReport();
      // Update file list display
      this.updateFileListDisplay();
    }
  }

  private closeBugReportPopup(): void {
    if (this.bugReportPopup && this.bugReportOverlay) {
      this.bugReportPopup.classList.remove('show');
      this.bugReportOverlay.classList.remove('show');
      // Clear state
      this.currentScreenshot = null;
      this.selectedFiles = [];
    }
  }

  private async captureScreenshotForBugReport(): Promise<void> {
    if (this.isCapturingScreenshot) return;

    this.isCapturingScreenshot = true;
    try {
      // First, try to capture with comprehensive oklch sanitization
      const canvas = await html2canvas(document.body, {
        allowTaint: true,
        useCORS: true,
        logging: false,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Comprehensive CSS sanitization
          this.sanitizeDocumentStyles(clonedDoc);
        },
        foreignObjectRendering: false,
      });

      this.currentScreenshot = canvas.toDataURL('image/jpeg', this.config.screenshotQuality);
      this.updateScreenshotPreview();
      this.log('Screenshot captured for bug report');
    } catch (error) {
      console.error('[UserTracker] Failed to capture screenshot for bug report:', error);
      // Fallback: try with minimal CSS parsing and sanitization
      try {
        const canvas = await html2canvas(document.body, {
          allowTaint: true,
          useCORS: false,
          logging: false,
          width: window.innerWidth,
          height: window.innerHeight,
          foreignObjectRendering: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            // Still sanitize even in fallback
            this.sanitizeDocumentStyles(clonedDoc);
          },
        });
        this.currentScreenshot = canvas.toDataURL('image/jpeg', this.config.screenshotQuality);
        this.updateScreenshotPreview();
        this.log('Screenshot captured for bug report (fallback)');
      } catch (fallbackError) {
        console.error('[UserTracker] Fallback screenshot capture also failed:', fallbackError);
        // Last resort: capture only viewport with very basic options and sanitization
        try {
          const canvas = await html2canvas(document.documentElement, {
            allowTaint: false,
            useCORS: false,
            logging: false,
            width: window.innerWidth,
            height: window.innerHeight,
            foreignObjectRendering: false,
            backgroundColor: '#ffffff',
            scale: 1,
            onclone: (clonedDoc) => {
              // Sanitize in last resort attempt too
              this.sanitizeDocumentStyles(clonedDoc);
            },
          });
          this.currentScreenshot = canvas.toDataURL('image/jpeg', this.config.screenshotQuality);
          this.updateScreenshotPreview();
          this.log('Screenshot captured for bug report (viewport only)');
        } catch (lastError) {
          console.error('[UserTracker] All screenshot capture methods failed:', lastError);
          // Set a placeholder or empty screenshot
          this.currentScreenshot = null;
        }
      }
    } finally {
      this.isCapturingScreenshot = false;
    }
  }

  private updateScreenshotPreview(): void {
    const preview = this.bugReportPopup?.querySelector('.tracker-bug-report-screenshot-preview') as HTMLElement;
    if (preview && this.currentScreenshot) {
      const img = preview.querySelector('img') as HTMLImageElement;
      if (img) {
        img.src = this.currentScreenshot;
        preview.style.display = 'block';
      }
    } else if (preview) {
      preview.style.display = 'none';
    }
  }

  private updateFileListDisplay(): void {
    const fileList = this.bugReportPopup?.querySelector('.tracker-bug-report-file-list') as HTMLElement;
    if (!fileList) return;

    fileList.innerHTML = '';
    if (this.selectedFiles.length === 0) {
      fileList.style.display = 'none';
      return;
    }

    fileList.style.display = 'block';
    this.selectedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'tracker-bug-report-file-item';
      
      const isImage = file.type.startsWith('image/');
      
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target?.result as string;
          img.className = 'tracker-bug-report-file-preview';
          fileItem.insertBefore(img, fileItem.firstChild);
        };
        reader.readAsDataURL(file);
      } else {
        const icon = document.createElement('span');
        icon.className = 'tracker-bug-report-file-icon';
        icon.textContent = '📄';
        fileItem.appendChild(icon);
      }

      const fileName = document.createElement('span');
      fileName.className = 'tracker-bug-report-file-name';
      fileName.textContent = file.name;
      fileItem.appendChild(fileName);

      const fileSize = document.createElement('span');
      fileSize.className = 'tracker-bug-report-file-size';
      fileSize.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
      fileItem.appendChild(fileSize);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'tracker-bug-report-file-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('data-tracker-ignore', 'true');
      removeBtn.addEventListener('click', () => {
        this.selectedFiles.splice(index, 1);
        this.updateFileListDisplay();
        // Reset file input
        const fileInput = this.bugReportPopup?.querySelector('#tracker-bug-attachments') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
      });
      fileItem.appendChild(removeBtn);

      fileList.appendChild(fileItem);
    });
  }

  private async handleBugReportSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const title = (formData.get('title') as string)?.trim();
    const description = (formData.get('description') as string)?.trim();

    if (!title || !description) {
      alert('Please fill in both title and description');
      return;
    }

    const submitBtn = form.querySelector('.tracker-bug-report-submit') as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      // Upload screenshot if available
      let screenshotId: number | null = null;
      if (this.currentScreenshot) {
        screenshotId = await this.uploadScreenshotForBugReport();
      }

      // Create issue
      const issueId = await this.createIssue(title, description, screenshotId);

      // Upload attachments
      if (this.selectedFiles.length > 0) {
        for (const file of this.selectedFiles) {
          await this.uploadAttachment(issueId, file);
        }
      }

      // Still send bug report event for tracking
      await this.submitBugReportEvent(title, description, issueId);

      alert('Bug report submitted successfully!');
      form.reset();
      this.closeBugReportPopup();
    } catch (error) {
      console.error('[UserTracker] Failed to submit bug report:', error);
      alert('Failed to submit bug report. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    }
  }

  private async uploadScreenshotForBugReport(): Promise<number | null> {
    if (!this.currentScreenshot || !this.sessionId) {
      return null;
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/track/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          page_url: window.location.href,
          timestamp: new Date().toISOString(),
          image_data: this.currentScreenshot,
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to upload screenshot: ${response.statusText}`);
      }

      const data = await response.json();
      return data.screenshot_id;
    } catch (error) {
      console.error('[UserTracker] Failed to upload screenshot:', error);
      return null;
    }
  }

  private async createIssue(title: string, description: string, screenshotId: number | null): Promise<number> {
    if (!this.sessionId) {
      throw new Error('Session ID is not available');
    }

    const url = this.buildApiUrl('issues');
    this.log('Creating issue at:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: this.sessionId,
        page_url: window.location.href,
        title: title,
        description: description,
        screenshot_id: screenshotId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      this.log('Failed to create issue:', response.status, errorText);
      throw new Error(`Failed to create issue: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data.issue_id;
  }

  private async uploadAttachment(issueId: number, file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const response = await fetch(`${this.config.apiUrl}/track/attachment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              issue_id: issueId,
              file_data: base64Data,
              file_name: file.name,
              file_type: file.type || 'application/octet-stream',
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to upload attachment: ${response.statusText}`);
          }

          const data = await response.json();
          resolve(data.attachment_id);
        } catch (error) {
          console.error('[UserTracker] Failed to upload attachment:', error);
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  private async submitBugReportEvent(title: string, description: string, issueId: number): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Session ID is not available');
    }

    const eventData: EventData = {
      timestamp: new Date(),
      event_type: 'bug_report',
      page_url: window.location.href,
      event_data: {
        title: title,
        description: description,
        issue_id: issueId,
      },
    };

    try {
      const response = await fetch(`${this.config.apiUrl}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          events: [eventData],
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to submit bug report event: ${response.statusText}`);
      }

      this.log('Bug report event submitted successfully');
    } catch (error) {
      console.error('[UserTracker] Failed to submit bug report event:', error);
      throw error;
    }
  }
}

// Export singleton instance
const tracker = new UserTracker();

// Expose to window
if (typeof window !== 'undefined') {
  (window as any).UserTracker = tracker;
}

export default tracker;
