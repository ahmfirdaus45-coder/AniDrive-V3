# 🔧 Integration Guide - Streaming Error Handler

## Quick Start (3 Steps)

### Step 1: Add Script to HTML
Di file `AniDrive_GoogleDrive_V10_ENCRYPTED_IMAGE_CACHE(1).html`, tambah ini **sebelum closing `</body>`**:

```html
<!-- Streaming Error Handler v36 -->
<script src="streaming-error-handler.js"></script>

<script>
  // Initialize handler saat page load
  document.addEventListener('DOMContentLoaded', () => {
    const handler = initStreamingErrorHandler('native-video-player');
    console.log('[SETUP] ✅ Streaming handler ready');
  });
</script>
```

### Step 2: Wrap Play Function
Cari function yang handle video playback (biasanya bernama `playVideoUrl`, `openPlayer`, dll), ubah jadi:

**BEFORE:**
```javascript
function playVideoUrl(url) {
  document.getElementById('native-video-player').src = url;
  document.getElementById('native-video-player').play();
}
```

**AFTER:**
```javascript
async function playVideoUrl(url, title = 'Video') {
  try {
    const handler = window.globalStreamingHandler;
    if (!handler) {
      console.warn('Handler not ready, using fallback');
      document.getElementById('native-video-player').src = url;
      document.getElementById('native-video-player').play();
      return;
    }
    
    // Load dengan error handling
    handler.showStreamingNotification('Loading...', 'info');
    await handler.loadVideo(url, { name: title, quality: '4K' });
    
    // Auto-play
    document.getElementById('native-video-player').play().catch(err => {
      console.warn('Autoplay blocked:', err);
    });
    
  } catch (error) {
    console.error('Playback error:', error);
    handler?.showStreamingNotification('Error: ' + error.message, 'error', 5000);
  }
}
```

### Step 3: Test & Verify
1. Open browser Developer Tools (`F12`)
2. Go to `Console` tab
3. Play a video
4. Lihat logs seperti:
   ```
   [STREAMING] Error handler initialized
   [STREAMING] Loading video: Anime Episode
   [STREAMING] Temporary link generated (HTTP Range supported for 4K)
   [STREAMING] Video loaded successfully - Quality: 4K
   ```

---

## 📍 Lokasi Exact untuk Edit

### Jika ada tombol play dengan ID:
```html
<!-- Find this in HTML -->
<button id="web-detail-play-btn" onclick="playVideoUrl(...)">START WATCHING</button>

<!-- Change onclick ke -->
<button id="web-detail-play-btn">START WATCHING</button>

<!-- Add event listener di script -->
<script>
  document.getElementById('web-detail-play-btn')?.addEventListener('click', async () => {
    // Use playVideoUrl function above
  });
</script>
```

### Jika ada Dropbox sync function:
```javascript
// BEFORE
async function initDropboxSync() {
  const token = await getDropboxAccessToken();
  // ... load catalog
}

// AFTER
async function initDropboxSync() {
  try {
    // Pastikan handler siap
    const handler = window.globalStreamingHandler;
    if (handler) {
      await handler.ensureValidTokenBeforeStreaming();
    }
    
    const token = await getDropboxAccessToken();
    // ... load catalog
  } catch (error) {
    console.error('Sync error:', error);
  }
}
```

---

## 🎯 Advanced Usage

### Custom Quality Selection
```javascript
// Set quality sebelum play
function playWith4K() {
  const handler = window.globalStreamingHandler;
  handler.setQuality('4K');
  playVideoUrl(videoUrl);
}

// Or allow user to choose:
function playWithQuality(quality) {
  const handler = window.globalStreamingHandler;
  handler.setQuality(quality); // '4K', '1440p', '1080p', '720p'
  playVideoUrl(videoUrl);
}
```

### Add Quality Selector UI
```html
<!-- Add quality buttons to player controls -->
<div id="quality-buttons" class="flex gap-2 p-2 bg-black/70 rounded">
  <button onclick="playWithQuality('4K')" 
          class="px-2 py-1 text-xs bg-orange-500 rounded hover:bg-orange-600">
    4K
  </button>
  <button onclick="playWithQuality('1080p')" 
          class="px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-700">
    1080p
  </button>
  <button onclick="playWithQuality('720p')" 
          class="px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-700">
    720p
  </button>
</div>
```

### Monitor Network Quality
```javascript
function displayNetworkInfo() {
  const handler = window.globalStreamingHandler;
  console.log('Network Quality:', handler.networkQuality);
  console.log('Current Quality:', handler.getQuality());
  
  // Show to user
  const info = `Network: ${handler.networkQuality} | Playing: ${handler.getQuality()}`;
  console.log(info);
}

// Call periodically
setInterval(displayNetworkInfo, 5000);
```

### Handle Playback Events
```javascript
const video = document.getElementById('native-video-player');

video.addEventListener('play', () => {
  console.log('[EVENT] Video playing');
});

video.addEventListener('pause', () => {
  console.log('[EVENT] Video paused');
});

video.addEventListener('ended', () => {
  console.log('[EVENT] Video ended');
});

video.addEventListener('seeking', () => {
  const handler = window.globalStreamingHandler;
  handler?.showStreamingNotification('Seeking...', 'info');
});

video.addEventListener('seeked', () => {
  const handler = window.globalStreamingHandler;
  handler?.hideStreamingNotification();
});
```

---

## 🐛 Troubleshooting

### Problem: Handler tidak initialize
**Log:** `[SETUP] ❌ Handler not initialized`

**Solution:**
1. Check `streaming-error-handler.js` di-load sebelum DOM content loaded
2. Pastikan video element ID = `native-video-player` (atau sesuaikan)
3. Verify di DevTools: `window.globalStreamingHandler` should exist

### Problem: Video tetap error setelah retry
**Log:** `[STREAMING RECOVERY] Max retries reached`

**Solution:**
1. Check Dropbox token valid → login lagi
2. Check file exist di Dropbox path
3. Check internet connection stable
4. Try different quality: `handler.setQuality('1080p')`

### Problem: Quality bukan 4K
**Log:** `[STREAMING] Video loaded successfully - Quality: 1080p`

**Penyebab:**
- Network connection buruk → recommend lower quality
- Temporary link invalid
- Dropbox file bukan 4K

**Solution:**
- Force 4K: `handler.setQuality('4K')` (warning: buffer banyak)
- Atau use 1080p untuk network stabil

### Problem: Seek tidak smooth/stalled saat scrub
**Penyebab:** HTTP Range requests tidak support

**Solution:**
1. Verify Dropbox API scope `files.content.read` aktif
2. Check browser support Range requests: 
   ```javascript
   fetch(videoUrl, { headers: { Range: 'bytes=0-1' } })
   ```
3. Try different video file

---

## ✅ Verification Checklist

Sebelum go live, verifikasi:

- [ ] `streaming-error-handler.js` di folder yang sama dengan HTML
- [ ] `<script src="streaming-error-handler.js">` ada di HTML
- [ ] DevTools Console: `window.globalStreamingHandler` exists
- [ ] Test play video → no error
- [ ] Test disconnect internet → auto-retry working
- [ ] Check quality → masih 4K
- [ ] Test seek → smooth, no buffering
- [ ] Test mobile → responsive
- [ ] Check logs → [STREAMING] messages visible

---

## 📊 Expected Console Output

### ✅ Success Flow
```
[SETUP] ✅ Streaming handler ready
[STREAMING] Error handler initialized
[STREAMING] Ensuring valid token before streaming...
[STREAMING] Token is valid
[STREAMING] Generating new Dropbox temporary link for 4K quality...
[STREAMING] Temporary link generated (HTTP Range supported for 4K)
[STREAMING] Loading video: Episode Title
[STREAMING] Video loaded successfully - Quality: 4K
```

### ⚠️ Error & Recovery Flow
```
[STREAMING] Loading video: Episode Title
[STREAMING ERROR] Error network (Code: 2)
[STREAMING RECOVERY] Starting recovery attempt 1/5
[STREAMING] Retry #1: Reloading video...
[STREAMING] Video loaded successfully - Quality: 4K
```

---

## 🔄 Migration Path

Jika ada existing streaming code:

1. **Keep existing video.js code** → handler just wrap-nya
2. **Don't remove existing `<video>` element** → handler attach event listeners
3. **Don't change video file paths** → handler resolve Dropbox paths
4. **Test thoroughly** → fallback ke old behavior jika ada issue

---

## 🚀 Deployment

1. **Test di staging/dev dulu**
   - Verify dengan beberapa devices
   - Check console for errors
   - Test 4K quality

2. **Merge branch ke main**
   ```bash
   git checkout main
   git pull
   git merge fix/streaming-error-handling
   git push
   ```

3. **Deploy ke production**
   - Ensure `streaming-error-handler.js` di-copy
   - Verify HTML updated dengan script tag
   - Monitor logs untuk issues

---

## 📞 Support

**Need help?** Check:
1. `STREAMING_ERROR_FIX.md` - Detailed explanation
2. Browser DevTools Console - Error messages
3. Network tab - HTTP requests/Range headers
4. Application tab - LocalStorage tokens

---

**Last Updated:** September 2026
**Version:** 1.0 - Initial Release
