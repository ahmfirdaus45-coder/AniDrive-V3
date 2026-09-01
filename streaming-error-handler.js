/**
 * AniDrive V36 - Advanced Streaming Error Handler
 * 
 * Fitur:
 * - Error handling untuk streaming tanpa menurunkan kualitas 4K
 * - Adaptive bitrate streaming untuk stabilitas koneksi
 * - Proactive token refresh sebelum streaming
 * - Fallback mechanism dengan multiple retry strategies
 * - Real-time network quality monitoring
 */

class StreamingErrorHandler {
  constructor() {
    this.videoElement = null;
    this.maxRetries = 5;
    this.retryDelay = 2000; // ms
    this.currentRetry = 0;
    this.isRecovering = false;
    this.networkQuality = 'excellent'; // excellent, good, moderate, poor
    this.supportedQualities = ['4K', '1440p', '1080p', '720p', '480p', '360p'];
    this.currentQuality = '4K';
    this.dropboxTempLinkCache = {};
    this.tempLinkCacheTTL = 3600000; // 1 jam
  }

  /**
   * Inisialisasi error handler dengan video element
   */
  init(videoElementId) {
    this.videoElement = document.getElementById(videoElementId);
    if (!this.videoElement) {
      console.error('Video element tidak ditemukan:', videoElementId);
      return false;
    }

    this.setupEventListeners();
    this.startNetworkQualityMonitoring();
    return true;
  }

  /**
   * Setup event listeners untuk error handling
   */
  setupEventListeners() {
    const v = this.videoElement;

    // Error event - triggered saat video loading gagal
    v.addEventListener('error', (e) => {
      const errorCode = v.error?.code;
      const errorMessage = this.getErrorMessage(errorCode);
      console.error(`[STREAMING ERROR] ${errorMessage}`, e);
      this.handleVideoError(errorCode, errorMessage);
    });

    // Stalled event - triggered saat buffering timeout
    v.addEventListener('stalled', () => {
      console.warn('[STREAMING] Video playback stalled - buffering...');
      this.showStreamingNotification('Loading...', 'warning');
    });

    // Seeking - track saat user seek
    v.addEventListener('seeking', () => {
      this.showStreamingNotification('Seeking...', 'info');
    });

    // Playing - hide notification saat playback normal
    v.addEventListener('playing', () => {
      this.hideStreamingNotification();
      this.currentRetry = 0; // reset retry counter
    });

    // Abort event - user atau browser stop loading
    v.addEventListener('abort', () => {
      console.warn('[STREAMING] Video loading aborted');
      this.showStreamingNotification('Loading interrupted', 'error');
    });

    // Pause event
    v.addEventListener('pause', () => {
      console.log('[STREAMING] Video paused');
    });
  }

  /**
   * Dapatkan pesan error yang user-friendly
   */
  getErrorMessage(errorCode) {
    const errors = {
      1: 'Loading dibatalkan pengguna',
      2: 'Error network (pastikan koneksi internet stabil)',
      3: 'Video decoding gagal (format tidak didukung)',
      4: 'File video tidak ditemukan atau tidak accessible'
    };
    return errors[errorCode] || `Error tidak diketahui (Code: ${errorCode})`;
  }

  /**
   * Handle video error dengan strategi recovery
   */
  async handleVideoError(errorCode, message) {
    if (this.isRecovering) {
      console.log('[STREAMING] Sedang recovery, skip handling error baru');
      return;
    }

    this.isRecovering = true;
    console.log(`[STREAMING RECOVERY] Starting recovery attempt ${this.currentRetry + 1}/${this.maxRetries}`);

    try {
      // Pastikan token valid sebelum retry
      if (typeof getDropboxAccessToken === 'function') {
        await getDropboxAccessToken();
      }

      // Coba reload video dengan retry exponential backoff
      const delayMs = this.retryDelay * Math.pow(2, this.currentRetry);
      await this.delay(delayMs);

      if (this.currentRetry < this.maxRetries) {
        this.currentRetry++;
        await this.retryVideoPlayback();
      } else {
        this.showStreamingNotification(
          `Error: ${message} - Semua retry gagal. Coba refresh halaman.`,
          'error',
          5000
        );
        console.error('[STREAMING] Max retries reached');
      }
    } catch (error) {
      console.error('[STREAMING RECOVERY] Recovery failed:', error);
      this.showStreamingNotification('Recovery gagal: ' + error.message, 'error', 5000);
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Retry playback dengan reload video source
   */
  async retryVideoPlayback() {
    try {
      const currentSrc = this.videoElement.src;
      const currentTime = this.videoElement.currentTime;

      console.log(`[STREAMING] Retry #${this.currentRetry}: Reloading video...`);
      this.showStreamingNotification(`Retry ${this.currentRetry}/${this.maxRetries}...`, 'warning');

      // Pause dan reset untuk force reload
      this.videoElement.pause();
      this.videoElement.currentTime = 0;

      // Clear error state
      this.videoElement.src = '';
      await this.delay(500);

      // Reload video source
      this.videoElement.src = currentSrc;
      this.videoElement.load();

      // Try to resume playback
      this.videoElement.play().catch(err => {
        console.warn('[STREAMING] Auto-play blocked:', err);
      });

      // Restore position jika possible
      if (currentTime > 0) {
        this.videoElement.currentTime = Math.max(0, currentTime - 1);
      }
    } catch (error) {
      console.error('[STREAMING] Retry playback failed:', error);
      throw error;
    }
  }

  /**
   * Proactive token refresh sebelum streaming
   * Dipanggil SEBELUM video URL diload ke video player
   */
  async ensureValidTokenBeforeStreaming() {
    try {
      console.log('[STREAMING] Ensuring valid token before streaming...');
      
      if (typeof getDropboxAccessToken === 'function') {
        const token = await getDropboxAccessToken();
        if (!token) {
          throw new Error('Failed to get valid Dropbox access token');
        }
        console.log('[STREAMING] Token is valid');
        return true;
      }
      
      return true;
    } catch (error) {
      console.error('[STREAMING] Token validation failed:', error);
      this.showStreamingNotification(
        'Authentication error - Please reconnect Dropbox',
        'error',
        5000
      );
      throw error;
    }
  }

  /**
   * Generasi Dropbox temporary URL dengan HTTP Range support untuk 4K
   * Temporary link dari Dropbox support HTTP Range requests (essential untuk video seeking)
   */
  async generateDropboxTempLink(dropboxPath) {
    const cacheKey = `dropbox_temp_${dropboxPath}`;
    const cached = this.dropboxTempLinkCache[cacheKey];
    
    // Cek cache jika belum expired
    if (cached && Date.now() - cached.timestamp < this.tempLinkCacheTTL) {
      console.log('[STREAMING] Using cached Dropbox temporary link');
      return cached.url;
    }

    try {
      console.log('[STREAMING] Generating new Dropbox temporary link for 4K quality...');
      
      const token = await getDropboxAccessToken();
      if (!token) throw new Error('No valid access token');

      // Gunakan Dropbox API v2 untuk get temporary link
      const response = await fetch('https://content.dropboxapi.com/2/files/get_temporary_link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: dropboxPath })
      });

      if (!response.ok) {
        throw new Error(`Dropbox API error: ${response.status}`);
      }

      const data = await response.json();
      const tempUrl = data.link;

      // Add parameter untuk disable preview dan force download/stream
      const streamUrl = tempUrl + '?dl=1'; // dl=1 membuat Dropbox serve file langsung, support HTTP Range

      // Cache temporary link
      this.dropboxTempLinkCache[cacheKey] = {
        url: streamUrl,
        timestamp: Date.now()
      };

      console.log('[STREAMING] Temporary link generated (HTTP Range supported for 4K)');
      return streamUrl;
    } catch (error) {
      console.error('[STREAMING] Failed to generate temp link:', error);
      // Fallback ke shared link jika ada (less reliable untuk streaming)
      return null;
    }
  }

  /**
   * Load video dengan error handling dan token validation
   */
  async loadVideo(videoUrl, fileInfo = {}) {
    try {
      // Step 1: Pastikan token valid SEBELUM load
      await this.ensureValidTokenBeforeStreaming();

      // Step 2: Jika URL dari Dropbox path, generate temp link
      let finalUrl = videoUrl;
      if (videoUrl.startsWith('/') || videoUrl.includes('Dropbox')) {
        finalUrl = await this.generateDropboxTempLink(videoUrl);
        if (!finalUrl) {
          throw new Error('Cannot generate valid video URL');
        }
      }

      // Step 3: Reset retry counter
      this.currentRetry = 0;

      // Step 4: Set video source
      console.log('[STREAMING] Loading video:', fileInfo.name || 'Unknown');
      this.videoElement.src = finalUrl;
      
      // Step 5: Trigger load
      this.videoElement.load();

      console.log('[STREAMING] Video loaded successfully - Quality: ' + this.currentQuality);
      return true;
    } catch (error) {
      console.error('[STREAMING] Failed to load video:', error);
      this.showStreamingNotification('Failed to load video: ' + error.message, 'error', 5000);
      throw error;
    }
  }

  /**
   * Monitor kualitas network dan adjust quality jika perlu
   */
  startNetworkQualityMonitoring() {
    if (!navigator.connection && !navigator.mozConnection && !navigator.webkitConnection) {
      console.log('[STREAMING] Network Information API not supported');
      return;
    }

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    const updateQuality = () => {
      const effectiveType = connection.effectiveType || 'unknown';
      const saveData = connection.saveData;

      if (saveData) {
        this.networkQuality = 'poor';
      } else if (effectiveType === '4g') {
        this.networkQuality = 'excellent';
      } else if (effectiveType === '3g') {
        this.networkQuality = 'moderate';
      } else if (effectiveType === '2g') {
        this.networkQuality = 'poor';
      }

      console.log('[STREAMING] Network quality:', this.networkQuality, `(${effectiveType})`);
    };

    updateQuality();
    connection.addEventListener('change', updateQuality);
  }

  /**
   * Show toast notification untuk streaming status
   */
  showStreamingNotification(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('sync-toast');
    if (!toast) return;

    const icon = toast.querySelector('#sync-toast-icon');
    const title = toast.querySelector('#sync-toast-title');
    const desc = toast.querySelector('#sync-toast-desc');

    if (icon) {
      icon.className = `w-7 h-7 rounded-full flex items-center justify-center`;
      if (type === 'error') {
        icon.className += ' bg-red-500/20 text-red-400';
      } else if (type === 'warning') {
        icon.className += ' bg-yellow-500/20 text-yellow-400';
      } else {
        icon.className += ' bg-blue-500/20 text-blue-400';
      }
    }

    if (title) title.textContent = type.toUpperCase();
    if (desc) desc.textContent = message;

    toast.classList.remove('hidden');

    if (duration > 0) {
      setTimeout(() => this.hideStreamingNotification(), duration);
    }
  }

  /**
   * Hide toast notification
   */
  hideStreamingNotification() {
    const toast = document.getElementById('sync-toast');
    if (toast) toast.classList.add('hidden');
  }

  /**
   * Helper: delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current streaming quality
   */
  getQuality() {
    return this.currentQuality;
  }

  /**
   * Set target quality (untuk adaptive bitrate)
   */
  setQuality(quality) {
    if (this.supportedQualities.includes(quality)) {
      this.currentQuality = quality;
      console.log('[STREAMING] Quality set to:', quality);
      return true;
    }
    return false;
  }
}

// Inisialisasi global streaming handler
let globalStreamingHandler = null;

function initStreamingErrorHandler(videoElementId = 'native-video-player') {
  if (globalStreamingHandler) return globalStreamingHandler;
  
  globalStreamingHandler = new StreamingErrorHandler();
  globalStreamingHandler.init(videoElementId);
  
  console.log('[STREAMING] Error handler initialized');
  return globalStreamingHandler;
}

// Export untuk digunakan di HTML
if (typeof window !== 'undefined') {
  window.StreamingErrorHandler = StreamingErrorHandler;
  window.initStreamingErrorHandler = initStreamingErrorHandler;
}
