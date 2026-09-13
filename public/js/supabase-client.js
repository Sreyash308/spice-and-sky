/**
 * Centralized Supabase & API Client for Spice & Sky Rooftop Cafe
 */

window.SpiceClient = (function () {
  // Transparent fetch interceptor: auto-attaches JWT & session key to all /api/ requests
  if (typeof window !== 'undefined' && window.fetch) {
    const _origFetch = window.fetch;
    window.fetch = function (resource, init) {
      try {
        const urlStr = typeof resource === 'string' ? resource : (resource ? resource.url : '');
        if (urlStr && (urlStr.startsWith('/api') || urlStr.includes('/api/'))) {
          init = init || {};
          const headers = new Headers(init.headers || {});
          const token = localStorage.getItem('spice_token') || localStorage.getItem('spice_session_id');
          if (token) {
            if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
            if (!headers.has('x-session-id')) headers.set('x-session-id', token);
          }
          init.headers = headers;
          init.credentials = init.credentials || 'same-origin';
        }
      } catch (e) {}
      return _origFetch(resource, init);
    };
  }

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

  function getStoredToken() {
    return currentSessionId ||
           (typeof localStorage !== 'undefined' ? (localStorage.getItem('spice_token') || localStorage.getItem('spice_session_id')) : null);
  }

  function getStoredUser() {
    if (currentUser) return currentUser;
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('spice_auth_user');
    if (!raw) return null;
    try {
      currentUser = JSON.parse(raw);
      return currentUser;
    } catch (e) {
      return null;
    }
  }

  // --- AUTHENTICATION & JWT SESSION HELPERS ---
  async function checkSession() {
    const storedUser = getStoredUser();
    const storedToken = getStoredToken();

    try {
      const headers = {};
      if (storedToken) {
        headers['x-session-id'] = storedToken;
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      const res = await fetch('/api/auth/session', { headers });
      const json = await res.json();
      if (json.success && json.authenticated && json.user) {
        currentUser = json.user;
        currentSessionId = json.token || json.sessionId || storedToken;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('spice_auth_user', JSON.stringify(currentUser));
          if (currentSessionId) {
            localStorage.setItem('spice_token', currentSessionId);
            localStorage.setItem('spice_session_id', currentSessionId);
          }
        }
        return { authenticated: true, user: currentUser, sessionId: currentSessionId, token: currentSessionId };
      } else if (json && json.authenticated === false) {
        // Explicitly unauthenticated by server (e.g. random user, fake token, or signed out)
        currentUser = null;
        currentSessionId = null;
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('spice_auth_user');
          localStorage.removeItem('spice_token');
          localStorage.removeItem('spice_session_id');
        }
        return { authenticated: false, user: null, sessionId: null, token: null };
      }
    } catch (e) {
      console.warn('Session check notice:', e);
      // On network failure or offline mode, retain valid stored session
      if (storedUser && storedToken) {
        currentUser = storedUser;
        currentSessionId = storedToken;
        return { authenticated: true, user: currentUser, sessionId: currentSessionId, token: currentSessionId };
      }
    }

    currentUser = null;
    currentSessionId = null;
    return { authenticated: false, user: null, sessionId: null, token: null };
  }

  async function signIn(email, password) {
    const rawIdentifier = (email || '').trim().toLowerCase();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: rawIdentifier, password })
      });
      const json = await res.json();

      if (json.success && json.user) {
        currentUser = json.user;
        currentSessionId = json.token || json.sessionId || json.session_id;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('spice_auth_user', JSON.stringify(currentUser));
          if (currentSessionId) {
            localStorage.setItem('spice_token', currentSessionId);
            localStorage.setItem('spice_session_id', currentSessionId);
          }
        }

        // Also sync client-side Supabase if present
        if (supabaseClient && rawIdentifier.includes('@')) {
          supabaseClient.auth.signInWithPassword({ email: rawIdentifier, password }).catch(() => {});
        }

        return { success: true, user: currentUser, sessionId: currentSessionId, token: currentSessionId };
      } else {
        throw new Error(json.error || 'Authentication failed.');
      }
    } catch (err) {
      console.error('Sign-in error:', err);
      throw err;
    }
  }

  function getSessionId() {
    return getStoredToken();
  }

  async function signOut() {
    const tokenToRevoke = getStoredToken();
    currentUser = null;
    currentSessionId = null;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('spice_auth_user');
      localStorage.removeItem('spice_token');
      localStorage.removeItem('spice_session_id');
      try { localStorage.clear(); } catch (e) {}
    }
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.clear(); } catch (e) {}
    }

    // Force expire client-accessible cookies
    try {
      document.cookie = 'spice_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
      document.cookie = 'spice_session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
    } catch (e) {}

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenToRevoke ? { 'Authorization': 'Bearer ' + tokenToRevoke, 'x-session-id': tokenToRevoke } : {})
        },
        body: JSON.stringify({ token: tokenToRevoke })
      });
    } catch (e) {}

    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (e) {}
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
    const ALLOWED_USERS = ['shan', 'yawar', 'nawaz', 'admin@143'];
    const uname = (user.username || user.display_name || '').toLowerCase();
    if (!ALLOWED_USERS.includes(uname)) {
      signOut();
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
    if (requiredRole === 'WAITER' && user.role !== 'WAITER' && user.role !== 'ADMIN') {
      if (window.location.pathname !== redirectPath) {
        window.location.href = redirectPath;
      }
      return null;
    }
    return user;
  }

  // --- FORMATTING & SANITIZATION UTILITIES ---
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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

  function showPopup() {
    // Popups disabled per user request
    return { destroy: () => {} };
  }

  function showToast() {
    // Notifications disabled per user request
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

  async function api(url, options = {}) {
    const res = await fetch(url, options);
    return res.json();
  }

  return {
    init,
    api,
    on,
    signIn,
    signOut,
    checkSession,
    getSessionId,
    getStoredUser,
    getStoredToken,
    requireRole,
    formatCurrency,
    formatDateTimeIST,
    escapeHtml,
    showToast,
    showPopup,
    printReceipt,
    getSupabase: () => supabaseClient
  };
})();
