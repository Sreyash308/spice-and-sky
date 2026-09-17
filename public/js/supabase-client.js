/**
 * Centralized Supabase & API Client for Spice & Sky Rooftop Cafe
 */

window.SpiceClient = (function () {
  function getActiveRole(overrideRole) {
    if (overrideRole) return String(overrideRole).toUpperCase();
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.pathname.includes('/waiter')) return 'WAITER';
      if (window.location.pathname.includes('/admin')) return 'ADMIN';
    }
    return null;
  }

  // Transparent fetch interceptor: auto-attaches JWT & session key to all /api/ requests
  // and auto-signs out if the server responds with 401 Unauthorized
  if (typeof window !== 'undefined' && window.fetch) {
    const _origFetch = window.fetch;
    window.fetch = async function (resource, init) {
      let urlStr = '';
      const isWaiterPortal = window.location.pathname.includes('/waiter');
      const isAdminPortal = window.location.pathname.includes('/admin');
      const activeRole = isWaiterPortal ? 'WAITER' : (isAdminPortal ? 'ADMIN' : null);

      try {
        urlStr = typeof resource === 'string' ? resource : (resource ? resource.url : '');
        if (urlStr && (urlStr.startsWith('/api') || urlStr.includes('/api/'))) {
          init = init || {};
          const headers = new Headers(init.headers || {});
          
          let token = null;
          if (typeof localStorage !== 'undefined') {
            if (isWaiterPortal) {
              token = localStorage.getItem('spice_waiter_token') || localStorage.getItem('spice_waiter_session_id') || localStorage.getItem('spice_token');
            } else if (isAdminPortal) {
              token = localStorage.getItem('spice_admin_token') || localStorage.getItem('spice_admin_session_id') || localStorage.getItem('spice_token');
            } else {
              token = localStorage.getItem('spice_token') || localStorage.getItem('spice_session_id') || localStorage.getItem('spice_waiter_token') || localStorage.getItem('spice_admin_token');
            }
          }

          if (token) {
            if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
            if (!headers.has('x-session-id')) headers.set('x-session-id', token);
          }
          if (activeRole) {
            headers.set('x-portal', activeRole.toLowerCase());
          }
          init.headers = headers;
          init.credentials = init.credentials || 'same-origin';
        }
      } catch (e) {}

      const res = await _origFetch(resource, init);

      // Auto-logout ONLY for active role if API returns 401 Unauthorized (except login endpoint itself)
      if (res && res.status === 401 && urlStr && urlStr.includes('/api/') && !urlStr.includes('/auth/login')) {
        try {
          if (typeof localStorage !== 'undefined') {
            if (isWaiterPortal) {
              localStorage.removeItem('spice_waiter_user');
              localStorage.removeItem('spice_waiter_token');
              localStorage.removeItem('spice_waiter_session_id');
            } else if (isAdminPortal) {
              localStorage.removeItem('spice_admin_user');
              localStorage.removeItem('spice_admin_token');
              localStorage.removeItem('spice_admin_session_id');
            }
          }
          const loginTarget = isWaiterPortal ? '/waiter/login' : '/admin/login';
          if (!window.location.pathname.includes('/login') && (isWaiterPortal || isAdminPortal)) {
            window.location.replace(loginTarget);
          }
        } catch (err) {}
      }

      return res;
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

        // Check active session automatically (skip if on a login page)
        if (typeof window === 'undefined' || !window.location.pathname.includes('/login')) {
          await checkSession();
        }
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
          if (parsed.type === 'FORCE_SIGNOUT') {
            console.warn('Authoritative session termination event received from server. Signing out...');
            signOut();
            const isWaiter = window.location.pathname.includes('/waiter');
            const loginTarget = isWaiter ? '/waiter/login' : '/admin/login';
            if (!window.location.pathname.includes('/login')) {
              window.location.replace(loginTarget);
            }
            return;
          }
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

  function getStoredToken(role) {
    const r = getActiveRole(role);
    if (typeof localStorage === 'undefined') return currentSessionId || null;
    if (r === 'WAITER') {
      return localStorage.getItem('spice_waiter_token') || localStorage.getItem('spice_waiter_session_id') || null;
    }
    if (r === 'ADMIN') {
      return localStorage.getItem('spice_admin_token') || localStorage.getItem('spice_admin_session_id') || null;
    }
    return currentSessionId || localStorage.getItem('spice_token') || localStorage.getItem('spice_session_id') || localStorage.getItem('spice_waiter_token') || localStorage.getItem('spice_admin_token') || null;
  }

  function getStoredUser(role) {
    const r = getActiveRole(role);
    if (typeof localStorage === 'undefined') return currentUser;

    let raw = null;
    if (r === 'WAITER') {
      raw = localStorage.getItem('spice_waiter_user');
    } else if (r === 'ADMIN') {
      raw = localStorage.getItem('spice_admin_user');
    } else {
      raw = localStorage.getItem('spice_auth_user') || localStorage.getItem('spice_waiter_user') || localStorage.getItem('spice_admin_user');
    }

    if (!raw) return null;
    try {
      const u = JSON.parse(raw);
      if (r && u.role && u.role !== r) {
        if (r === 'WAITER') {
          const waiterRaw = localStorage.getItem('spice_waiter_user');
          return waiterRaw ? JSON.parse(waiterRaw) : null;
        } else if (r === 'ADMIN') {
          const adminRaw = localStorage.getItem('spice_admin_user');
          return adminRaw ? JSON.parse(adminRaw) : null;
        }
      }
      return u;
    } catch (e) {
      return null;
    }
  }

  // --- AUTHENTICATION & JWT SESSION HELPERS ---
  async function checkSession(role) {
    if (typeof window !== 'undefined' && window.location.pathname.includes('/login')) {
      currentUser = null;
      currentSessionId = null;
      return { authenticated: false, user: null, sessionId: null, token: null };
    }

    const r = getActiveRole(role);
    const storedUser = getStoredUser(r);
    const storedToken = getStoredToken(r);

    try {
      const headers = {};
      if (storedToken) {
        headers['x-session-id'] = storedToken;
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      if (r) {
        headers['x-portal'] = r.toLowerCase();
      }
      const portalQuery = r ? `?portal=${r.toLowerCase()}` : '';
      const res = await fetch(`/api/auth/session${portalQuery}`, { headers });
      const json = await res.json();
      if (json.success && json.authenticated && json.user) {
        const u = json.user;
        const tok = json.token || json.sessionId || storedToken;
        currentUser = u;
        currentSessionId = tok;

        if (typeof localStorage !== 'undefined') {
          if (u.role === 'WAITER' || r === 'WAITER') {
            localStorage.setItem('spice_waiter_user', JSON.stringify(u));
            if (tok) {
              localStorage.setItem('spice_waiter_token', tok);
              localStorage.setItem('spice_waiter_session_id', tok);
            }
          } else if (u.role === 'ADMIN' || r === 'ADMIN') {
            localStorage.setItem('spice_admin_user', JSON.stringify(u));
            if (tok) {
              localStorage.setItem('spice_admin_token', tok);
              localStorage.setItem('spice_admin_session_id', tok);
            }
          }
          localStorage.setItem('spice_auth_user', JSON.stringify(u));
          if (tok) localStorage.setItem('spice_token', tok);
        }
        return { authenticated: true, user: u, sessionId: tok, token: tok };
      } else if (json && json.authenticated === false) {
        // Explicitly unauthenticated by server (e.g. revoked token)
        if (storedToken && typeof localStorage !== 'undefined') {
          if (r === 'WAITER') {
            localStorage.removeItem('spice_waiter_user');
            localStorage.removeItem('spice_waiter_token');
            localStorage.removeItem('spice_waiter_session_id');
          } else if (r === 'ADMIN') {
            localStorage.removeItem('spice_admin_user');
            localStorage.removeItem('spice_admin_token');
            localStorage.removeItem('spice_admin_session_id');
          }
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

    return { authenticated: false, user: null, sessionId: null, token: null };
  }

  async function signIn(email, password, options = {}) {
    const rawIdentifier = (email || '').trim().toLowerCase();
    const isWaiter = options.portal === 'waiter' || (typeof window !== 'undefined' && window.location.pathname.includes('/waiter'));
    const portal = options.portal || (isWaiter ? 'waiter' : 'admin');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: rawIdentifier, password, portal })
      });
      const json = await res.json();

      if (json.success && json.user) {
        const u = json.user;
        const tok = json.token || json.sessionId || json.session_id;
        currentUser = u;
        currentSessionId = tok;

        if (typeof localStorage !== 'undefined') {
          if (u.role === 'WAITER' || portal === 'waiter') {
            localStorage.setItem('spice_waiter_user', JSON.stringify(u));
            if (tok) {
              localStorage.setItem('spice_waiter_token', tok);
              localStorage.setItem('spice_waiter_session_id', tok);
            }
          } else if (u.role === 'ADMIN' || portal === 'admin') {
            localStorage.setItem('spice_admin_user', JSON.stringify(u));
            if (tok) {
              localStorage.setItem('spice_admin_token', tok);
              localStorage.setItem('spice_admin_session_id', tok);
            }
          }
          localStorage.setItem('spice_auth_user', JSON.stringify(u));
          if (tok) {
            localStorage.setItem('spice_token', tok);
            localStorage.setItem('spice_session_id', tok);
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

  function getSessionId(role) {
    return getStoredToken(role);
  }

  async function signOut(role) {
    const r = getActiveRole(role);
    const tokenToRevoke = getStoredToken(r);
    currentUser = null;
    currentSessionId = null;

    if (typeof localStorage !== 'undefined') {
      if (r === 'WAITER') {
        localStorage.removeItem('spice_waiter_user');
        localStorage.removeItem('spice_waiter_token');
        localStorage.removeItem('spice_waiter_session_id');
        try {
          const authRaw = localStorage.getItem('spice_auth_user');
          if (authRaw) {
            const parsed = JSON.parse(authRaw);
            if (parsed && parsed.role === 'WAITER') {
              localStorage.removeItem('spice_auth_user');
              localStorage.removeItem('spice_token');
              localStorage.removeItem('spice_session_id');
            }
          }
        } catch (e) {
          localStorage.removeItem('spice_auth_user');
          localStorage.removeItem('spice_token');
          localStorage.removeItem('spice_session_id');
        }
      } else if (r === 'ADMIN') {
        localStorage.removeItem('spice_admin_user');
        localStorage.removeItem('spice_admin_token');
        localStorage.removeItem('spice_admin_session_id');
        try {
          const authRaw = localStorage.getItem('spice_auth_user');
          if (authRaw) {
            const parsed = JSON.parse(authRaw);
            if (parsed && parsed.role === 'ADMIN') {
              localStorage.removeItem('spice_auth_user');
              localStorage.removeItem('spice_token');
              localStorage.removeItem('spice_session_id');
            }
          }
        } catch (e) {
          localStorage.removeItem('spice_auth_user');
          localStorage.removeItem('spice_token');
          localStorage.removeItem('spice_session_id');
        }
      } else {
        localStorage.removeItem('spice_waiter_user');
        localStorage.removeItem('spice_waiter_token');
        localStorage.removeItem('spice_waiter_session_id');
        localStorage.removeItem('spice_admin_user');
        localStorage.removeItem('spice_admin_token');
        localStorage.removeItem('spice_admin_session_id');
        localStorage.removeItem('spice_auth_user');
        localStorage.removeItem('spice_token');
        localStorage.removeItem('spice_session_id');
      }
    }

    if (typeof document !== 'undefined') {
      const expiredCookie = '; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0';
      if (r === 'WAITER') {
        document.cookie = 'spice_waiter_token=' + expiredCookie;
      } else if (r === 'ADMIN') {
        document.cookie = 'spice_admin_token=' + expiredCookie;
      }
      document.cookie = 'spice_token=' + expiredCookie;
      document.cookie = 'spice_session_id=' + expiredCookie;
    }

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToRevoke, portal: r ? r.toLowerCase() : undefined }),
        keepalive: true
      });
    } catch (e) {}

    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (e) {}
    }
  }

  function requireRole(requiredRole, redirectPath) {
    const user = getStoredUser(requiredRole);
    if (!user) {
      if (window.location.pathname !== redirectPath) {
        window.location.replace(redirectPath);
      }
      return null;
    }
    const uname = (user.username || user.display_name || '').toLowerCase();
    
    if (requiredRole === 'WAITER') {
      const ALLOWED_WAITERS = ['shan', 'yawar', 'nawaz'];
      if (user.role !== 'WAITER' || !ALLOWED_WAITERS.includes(uname)) {
        signOut('WAITER');
        if (window.location.pathname !== redirectPath) {
          window.location.replace(redirectPath);
        }
        return null;
      }
    } else if (requiredRole === 'ADMIN') {
      if (user.role !== 'ADMIN' || uname !== 'admin@143') {
        signOut('ADMIN');
        if (window.location.pathname !== redirectPath) {
          window.location.replace(redirectPath);
        }
        return null;
      }
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

  if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
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
            .receipt-logo {
              height: 14mm;
              max-width: 50mm;
              margin: 0 auto 2mm auto;
              display: block;
              object-fit: contain;
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
