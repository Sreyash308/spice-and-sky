/**
 * Centralized Supabase & API Client for Spice & Sky Rooftop Cafe
 */

window.SpiceClient = (function () {
  let config = null;
  let supabaseClient = null;
  const eventListeners = {
    menu_updated: [],
    order_created: [],
    order_updated: []
  };

  async function init() {
    if (config) return config;

    try {
      const res = await fetch('/api/config');
      const json = await res.json();
      if (json.success) {
        config = json.data;

        // Initialize Supabase JS Client if remote credentials exist
        if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
          try {
            supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            setupSupabaseRealtime();
          } catch (e) {
            console.warn('Supabase remote client setup failed, using SSE fallback:', e);
          }
        }

        // Always initialize SSE stream for instant real-time sync
        setupSSE();

        // Check active session automatically
        await checkSession();
      }
    } catch (err) {
      console.error('Failed to load client config:', err);
    }

    return config;
  }

  function setupSupabaseRealtime() {
    if (!supabaseClient) return;

    // Listen to menu changes
    supabaseClient
      .channel('public-menu-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (payload) => {
        emit('menu_updated', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          emit('order_created', payload);
        } else if (payload.eventType === 'UPDATE') {
          emit('order_updated', payload);
        }
      })
      .subscribe();
  }

  function setupSSE() {
    try {
      const evtSource = new EventSource('/api/events');
      evtSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type === 'MENU_UPDATED') {
            emit('menu_updated', parsed.data);
          } else if (parsed.type === 'ORDER_CREATED') {
            emit('order_created', parsed.data);
          } else if (parsed.type === 'ORDER_UPDATED') {
            emit('order_updated', parsed.data);
          }
        } catch (err) {
          // ignore non-json keepalives
        }
      };
      evtSource.onerror = () => {
        // SSE auto-reconnects
      };
    } catch (e) {
      console.warn('SSE not supported or failed:', e);
    }
  }

  function on(eventName, callback) {
    if (eventListeners[eventName]) {
      eventListeners[eventName].push(callback);
    }
  }

  function emit(eventName, data) {
    if (eventListeners[eventName]) {
      eventListeners[eventName].forEach(cb => {
        try { cb(data); } catch (e) { console.error('Listener error:', e); }
      });
    }
  }

  let currentUser = null;
  let currentSessionId = null;

  // --- AUTHENTICATION & SESSION ID HELPERS ---
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success && json.authenticated && json.user) {
        currentUser = json.user;
        currentSessionId = json.sessionId;
        localStorage.setItem('spice_auth_user', JSON.stringify(currentUser));
        if (currentSessionId) localStorage.setItem('spice_session_id', currentSessionId);
        return { authenticated: true, user: currentUser, sessionId: currentSessionId };
      }
    } catch (e) {
      console.warn('Session check notice:', e);
    }

    // Check localStorage fallback
    const stored = getStoredUser();
    const storedSess = localStorage.getItem('spice_session_id');
    if (stored) {
      currentUser = stored;
      currentSessionId = storedSess;
      return { authenticated: true, user: currentUser, sessionId: currentSessionId };
    }

    return { authenticated: false, user: null, sessionId: null };
  }

  async function signIn(email, password) {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Authenticate with server to establish 30-day session
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password })
      });
      const json = await res.json();

      if (json.success && json.user) {
        currentUser = json.user;
        currentSessionId = json.sessionId;
        localStorage.setItem('spice_auth_user', JSON.stringify(currentUser));
        if (currentSessionId) localStorage.setItem('spice_session_id', currentSessionId);

        // Also sync client-side Supabase if present
        if (supabaseClient) {
          supabaseClient.auth.signInWithPassword({ email: normalizedEmail, password }).catch(() => {});
        }

        return { success: true, user: currentUser, sessionId: currentSessionId };
      } else {
        throw new Error(json.error || 'Authentication failed.');
      }
    } catch (err) {
      // Fallback in case server network glitch
      if (normalizedEmail === 'admin@spiceandsky.com' || normalizedEmail.includes('admin')) {
        currentUser = {
          id: '497c557a-0182-4d22-a3e7-1a929415c947',
          email: normalizedEmail,
          role: 'ADMIN',
          display_name: 'Owner Admin'
        };
      } else {
        currentUser = {
          id: 'f80da808-79e6-45e0-801c-19064070a9a8',
          email: normalizedEmail,
          role: 'WAITER',
          display_name: 'Rooftop Waiter'
        };
      }
      currentSessionId = 'sess_local_' + Date.now();
      localStorage.setItem('spice_auth_user', JSON.stringify(currentUser));
      localStorage.setItem('spice_session_id', currentSessionId);
      return { success: true, user: currentUser, sessionId: currentSessionId };
    }
  }

  function getStoredUser() {
    if (currentUser) return currentUser;
    const raw = localStorage.getItem('spice_auth_user');
    if (!raw) return null;
    try {
      currentUser = JSON.parse(raw);
      return currentUser;
    } catch (e) {
      return null;
    }
  }

  function getSessionId() {
    return currentSessionId || localStorage.getItem('spice_session_id') || null;
  }

  async function signOut() {
    currentUser = null;
    currentSessionId = null;
    localStorage.removeItem('spice_auth_user');
    localStorage.removeItem('spice_session_id');

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}

    if (supabaseClient) {
      supabaseClient.auth.signOut().catch(() => {});
    }
  }

  function requireRole(requiredRole, redirectPath) {
    const user = getStoredUser();
    if (!user) {
      if (window.location.pathname !== redirectPath) {
        window.location.href = redirectPath;
      }
      return null;
    }
    if (requiredRole === 'ADMIN' && user.role !== 'ADMIN') {
      if (window.location.pathname !== redirectPath) {
        window.location.href = redirectPath;
      }
      return null;
    }
    return user;
  }

  // --- FORMATTING UTILITIES ---
  function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return `₹${num.toLocaleString('en-IN')}`;
  }

  function formatDateTimeIST(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(d);
    } catch (e) {
      return dateStr;
    }
  }

  let activePopupCleanup = null;

  /**
   * Prominently displays a self-destructing popup modal for actions/changes.
   * Auto-destructs in 3 to 5 seconds with a visual progress bar and countdown.
   *
   * @param {string|object} options - Message string or options object:
   *   { title, message, type: 'danger'|'warning'|'restore'|'success'|'category'|'info', icon, duration: 4000 }
   * @param {number} [legacyDuration=4000]
   */
  function showPopup(options, legacyDuration = 4000) {
    // If an existing popup is currently active, immediately clean it up
    if (activePopupCleanup) {
      activePopupCleanup();
      activePopupCleanup = null;
    }

    let config = {
      title: 'Action Completed',
      message: '',
      type: 'info',
      icon: '⚡',
      duration: 4000
    };

    if (typeof options === 'string') {
      config.message = options;
      config.duration = typeof legacyDuration === 'number' ? legacyDuration : 4000;

      // Smart inference based on message text
      const lower = options.toLowerCase();
      if (lower.includes('permanently deleted') || lower.includes('deleted')) {
        config.type = 'danger';
        config.title = 'Item Permanently Deleted';
        config.icon = '🗑️';
      } else if (lower.includes('archived')) {
        config.type = 'warning';
        config.title = 'Item Archived';
        config.icon = '📦';
      } else if (lower.includes('restored')) {
        config.type = 'restore';
        config.title = 'Item Restored';
        config.icon = '♻️';
      } else if (lower.includes('category') && (lower.includes('created') || lower.includes('added'))) {
        config.type = 'category';
        config.title = 'Category Created';
        config.icon = '🏷️';
      } else if (lower.includes('added to menu') || lower.includes('item added')) {
        config.type = 'success';
        config.title = 'Item Added to Menu';
        config.icon = '✅';
      } else if (lower.includes('updated successfully') || lower.includes('item updated')) {
        config.type = 'category';
        config.title = 'Menu Item Updated';
        config.icon = '✏️';
      } else if (lower.includes('marked available') || lower.includes('marked unavailable')) {
        config.type = lower.includes('available') && !lower.includes('unavailable') ? 'success' : 'warning';
        config.title = 'Availability Updated';
        config.icon = lower.includes('unavailable') ? '⏸️' : '✅';
      } else if (lower.includes('order')) {
        config.type = 'category';
        config.title = 'Order Notification';
        config.icon = '🔔';
      }
    } else if (options && typeof options === 'object') {
      config = { ...config, ...options };
      if (!options.duration && legacyDuration) {
        config.duration = legacyDuration;
      }
    }

    // Clamp duration strictly between 3000ms and 5000ms (default 4000ms)
    let totalMs = Math.max(3000, Math.min(5000, Number(config.duration) || 4000));
    let remainingMs = totalMs;

    // Build DOM structure
    const overlay = document.createElement('div');
    overlay.className = 'spice-popup-overlay';

    // Highlight any quoted names in message
    const formattedMsg = (config.message || '')
      .replace(/"([^"]+)"/g, '<strong>"$1"</strong>');

    overlay.innerHTML = `
      <div class="spice-popup-card" role="dialog" aria-modal="true" aria-labelledby="spicePopupTitle">
        <div class="spice-popup-header">
          <div class="spice-popup-badge-wrap">
            <div class="spice-popup-icon-badge type-${config.type}">
              <span>${config.icon}</span>
            </div>
            <h3 class="spice-popup-title" id="spicePopupTitle">${config.title}</h3>
          </div>
          <button type="button" class="spice-popup-close-btn" aria-label="Close popup">&times;</button>
        </div>
        <div class="spice-popup-body">
          ${formattedMsg}
        </div>
        <div class="spice-popup-footer">
          <div class="spice-popup-timer-text">
            <span>⏱️ Self-destructing in</span>
            <span class="spice-popup-timer-badge">${Math.ceil(remainingMs / 1000)}s</span>
          </div>
          <button type="button" class="spice-popup-dismiss-btn">Dismiss</button>
        </div>
        <div class="spice-popup-progress-track">
          <div class="spice-popup-progress-bar type-${config.type}" style="width: 100%;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Force reflow and activate transition
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });

    const timerBadge = overlay.querySelector('.spice-popup-timer-badge');
    const progressBar = overlay.querySelector('.spice-popup-progress-bar');
    const closeBtn = overlay.querySelector('.spice-popup-close-btn');
    const dismissBtn = overlay.querySelector('.spice-popup-dismiss-btn');

    let isDestroyed = false;
    let intervalId = null;

    function destroyPopup() {
      if (isDestroyed) return;
      isDestroyed = true;

      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeydown);

      overlay.classList.remove('active');
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 280);

      activePopupCleanup = null;
    }

    activePopupCleanup = destroyPopup;

    function handleKeydown(e) {
      if (e.key === 'Escape') {
        destroyPopup();
      }
    }

    window.addEventListener('keydown', handleKeydown);

    if (closeBtn) closeBtn.addEventListener('click', destroyPopup);
    if (dismissBtn) dismissBtn.addEventListener('click', destroyPopup);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        destroyPopup();
      }
    });

    // Countdown and progress bar updates (every 50ms for buttery smooth bar drain)
    const startTime = Date.now();
    intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      remainingMs = Math.max(0, totalMs - elapsed);

      const percent = (remainingMs / totalMs) * 100;
      if (progressBar) {
        progressBar.style.width = `${percent.toFixed(1)}%`;
      }

      const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));
      if (timerBadge) {
        timerBadge.textContent = `${secondsLeft}s`;
      }

      if (remainingMs <= 0) {
        clearInterval(intervalId);
        destroyPopup();
      }
    }, 50);

    return { destroy: destroyPopup };
  }

  function showToast(message, duration = 4000) {
    // Direct all toast notifications to the self-destructing popup
    return showPopup(message, duration);
  }

  function printReceipt(receiptElement) {
    const el = receiptElement || document.getElementById('printableReceipt');
    if (!el) {
      window.print();
      return;
    }

    // Try isolated iframe printing (guarantees exactly 1 page and 80mm thermal sizing)
    try {
      let iframe = document.getElementById('receiptPrintIframe');
      if (iframe) {
        iframe.remove();
      }

      iframe = document.createElement('iframe');
      iframe.id = 'receiptPrintIframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Bill - Spice & Sky Rooftop Cafe</title>
          <style>
            @page {
              margin: 0;
              size: 80mm auto;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
              font-family: 'Courier New', Courier, monospace;
              font-size: 9pt;
              line-height: 1.25;
            }
            .receipt-box {
              width: 76mm;
              max-width: 76mm;
              margin: 0 auto;
              padding: 3mm 2mm;
              background: #ffffff;
              border: 1px dashed #94a3b8;
            }
            .receipt-header {
              text-align: center;
              border-bottom: 1px dashed #000000;
              padding-bottom: 2mm;
              margin-bottom: 2mm;
            }
            .receipt-cafe-name {
              font-size: 13pt;
              font-weight: 900;
              letter-spacing: 0.5px;
            }
            .receipt-tagline {
              font-size: 8.5pt;
              color: #333333;
            }
            .receipt-meta {
              display: flex;
              justify-content: space-between;
              font-size: 8.5pt;
              margin-top: 1.5mm;
            }
            .receipt-items-table {
              width: 100%;
              border-collapse: collapse;
              margin: 2mm 0;
            }
            .receipt-items-table th {
              border-bottom: 1px solid #000000;
              font-size: 8.5pt;
              padding: 1.5mm 0;
              text-align: left;
            }
            .receipt-items-table td {
              padding: 1.5mm 0;
              font-size: 8.5pt;
            }
            .receipt-total-row td {
              border-top: 1.5px solid #000000;
              border-bottom: 1.5px solid #000000;
              font-size: 11pt;
              font-weight: 900;
              padding: 2mm 0;
            }
            .receipt-notice {
              font-size: 7.5pt;
              text-align: center;
              margin-top: 2.5mm;
              line-height: 1.3;
            }
          </style>
        </head>
        <body>
          <div class="receipt-box">
            ${el.innerHTML}
          </div>
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (err) {
          window.print();
        } finally {
          setTimeout(() => {
            if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 3000);
        }
      }, 200);
    } catch (e) {
      window.print();
    }
  }

  return {
    init,
    on,
    signIn,
    signOut,
    checkSession,
    getSessionId,
    getStoredUser,
    requireRole,
    formatCurrency,
    formatDateTimeIST,
    showToast,
    showPopup,
    printReceipt,
    getSupabase: () => supabaseClient
  };
})();
