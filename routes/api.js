/**
 * API Routes for Spice & Sky Rooftop Cafe
 */

const express = require('express');
const router = express.Router();
const dbService = require('../db/supabase_service');
const localStore = require('../db/local_store');

// SSE Clients for instant synchronization
const sseClients = new Set();

function broadcastEvent(type, payload) {
  const data = JSON.stringify({ type, data: payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Listen to local store events to broadcast
localStore.on('menu_updated', (data) => broadcastEvent('MENU_UPDATED', data));
localStore.on('order_created', (data) => broadcastEvent('ORDER_CREATED', data));
localStore.on('order_updated', (data) => broadcastEvent('ORDER_UPDATED', data));

// ============================================================
// ============================================================
// STATELESS JWT & SESSION KEY AUTHENTICATION
// Supports multiple concurrent logins, persistent 365-day tokens,
// and survives all server restarts without re-authenticating.
// ============================================================
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sessionManager = require('../db/session_manager');

// Authoritative Default Users (Admin & Waiters)
const DEFAULT_USERS = {
  ADMIN: {
    id: '497c557a-0182-4d22-a3e7-1a929415c947',
    email: 'admin@143',
    username: 'admin@143',
    role: 'ADMIN',
    display_name: 'admin@143'
  },
  WAITER_SHAN: {
    id: 'f80da808-79e6-45e0-801c-19064070a9a1',
    email: 'shan@spiceandsky.com',
    username: 'Shan',
    role: 'WAITER',
    display_name: 'Shan'
  },
  WAITER_YAWAR: {
    id: 'f80da808-79e6-45e0-801c-19064070a9a2',
    email: 'yawar@spiceandsky.com',
    username: 'Yawar',
    role: 'WAITER',
    display_name: 'Yawar'
  },
  WAITER_NAWAZ: {
    id: 'f80da808-79e6-45e0-801c-19064070a9a3',
    email: 'nawaz@spiceandsky.com',
    username: 'Nawaz',
    role: 'WAITER',
    display_name: 'Nawaz'
  }
};

function createSessionToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      username: user.username || user.display_name,
      display_name: user.display_name || user.username,
      jti: crypto.randomUUID(),
      sessionEpoch: sessionManager.getEpoch()
    },
    sessionManager.getSecret(),
    { expiresIn: '365d' } // Valid for 1 whole year
  );
}

function verifyUserToken(req, targetRole = null) {
  const candidateTokens = [];

  // 1. Explicit request headers take highest priority
  const authHeader = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const sessionHeader = req.headers['x-session-id'] || req.headers['x-auth-token'];
  if (authHeader) candidateTokens.push(authHeader);
  if (sessionHeader && !candidateTokens.includes(sessionHeader)) candidateTokens.push(sessionHeader);

  // 2. Role-specific cookies based on context or requested role
  const portalContext = req.headers['x-portal'] || req.query?.portal || '';
  const isWaiterReq = targetRole === 'WAITER' || portalContext === 'waiter' || req.originalUrl?.includes('/waiter') || req.path?.includes('/waiter');
  const isAdminReq = targetRole === 'ADMIN' || portalContext === 'admin' || req.originalUrl?.includes('/admin') || req.path?.includes('/admin');

  if (isWaiterReq && req.cookies?.spice_waiter_token) {
    candidateTokens.push(req.cookies.spice_waiter_token);
  }
  if (isAdminReq && req.cookies?.spice_admin_token) {
    candidateTokens.push(req.cookies.spice_admin_token);
  }

  // 3. Fallback cookies
  if (req.cookies?.spice_waiter_token && !candidateTokens.includes(req.cookies.spice_waiter_token)) {
    candidateTokens.push(req.cookies.spice_waiter_token);
  }
  if (req.cookies?.spice_admin_token && !candidateTokens.includes(req.cookies.spice_admin_token)) {
    candidateTokens.push(req.cookies.spice_admin_token);
  }
  if (req.cookies?.spice_token && !candidateTokens.includes(req.cookies.spice_token)) {
    candidateTokens.push(req.cookies.spice_token);
  }
  if (req.cookies?.spice_session_id && !candidateTokens.includes(req.cookies.spice_session_id)) {
    candidateTokens.push(req.cookies.spice_session_id);
  }

  for (const raw of candidateTokens) {
    if (!raw) continue;
    const token = String(raw).trim();
    if (localStore.isTokenRevoked(token)) continue;

    try {
      const decoded = jwt.verify(token, sessionManager.getSecret());
      if (decoded && decoded.role) {
        if (decoded.jti && localStore.isTokenRevoked(decoded.jti)) continue;
        if (!decoded.sessionEpoch || Number(decoded.sessionEpoch) < sessionManager.getEpoch()) continue;
        if (targetRole && decoded.role !== targetRole) continue;
        return { user: decoded, token };
      }
    } catch (err) {
      // Continue to next candidate
    }
  }

  return null;
}

// Authentication & Role Authorization Middleware
function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    const auth = verifyUserToken(req);
    if (!auth || !auth.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please sign in with staff or admin credentials.'
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(auth.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}].`
      });
    }

    req.user = auth.user;
    req.token = auth.token;
    req.session = { sessionId: auth.token, user: auth.user };
    next();
  };
}

// POST /api/auth/login - Authenticate staff/owner and issue 1-year JSON Web Token (JWT)
router.post('/auth/login', async (req, res) => {
  try {
    const rawIdentifier = (req.body.email || req.body.username || '').trim().toLowerCase();
    const rawPassword = req.body.password != null ? String(req.body.password).trim() : '';
    const portal = (req.body.portal || '').trim().toLowerCase();

    if (!rawIdentifier || !rawPassword) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    let authUser = null;

    // STRICT WAITER TERMINAL CHECK:
    // If logging into waiter portal or if identifier is waiter-specific
    if (portal === 'waiter') {
      if (rawIdentifier === 'shan' || rawIdentifier === 'shan@spiceandsky.com') {
        if (rawPassword.toLowerCase() === 'waiter') {
          authUser = DEFAULT_USERS.WAITER_SHAN;
        } else {
          return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }
      } else if (rawIdentifier === 'yawar' || rawIdentifier === 'yawar@spiceandsky.com') {
        if (rawPassword.toLowerCase() === 'waiter') {
          authUser = DEFAULT_USERS.WAITER_YAWAR;
        } else {
          return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }
      } else if (rawIdentifier === 'nawaz' || rawIdentifier === 'nawaz@spiceandsky.com') {
        if (rawPassword.toLowerCase() === 'waiter') {
          authUser = DEFAULT_USERS.WAITER_NAWAZ;
        } else {
          return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }
      } else {
        // Any random credential or admin attempting to login to waiter terminal is blocked
        return res.status(401).json({
          success: false,
          error: 'Access denied. Only authorized staff (Shan, Yawar, Nawaz) are permitted to log into the Waiter Terminal.'
        });
      }
    } else {
      // General login endpoint (Admin or Waiters)
      if (rawIdentifier === 'admin@143') {
        if (rawPassword === 'admin@143') {
          authUser = DEFAULT_USERS.ADMIN;
        } else {
          return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }
      } else if (rawIdentifier === 'shan' || rawIdentifier === 'shan@spiceandsky.com') {
        if (rawPassword.toLowerCase() === 'waiter') {
          authUser = DEFAULT_USERS.WAITER_SHAN;
        } else {
          return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }
      } else if (rawIdentifier === 'yawar' || rawIdentifier === 'yawar@spiceandsky.com') {
        if (rawPassword.toLowerCase() === 'waiter') {
          authUser = DEFAULT_USERS.WAITER_YAWAR;
        } else {
          return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }
      } else if (rawIdentifier === 'nawaz' || rawIdentifier === 'nawaz@spiceandsky.com') {
        if (rawPassword.toLowerCase() === 'waiter') {
          authUser = DEFAULT_USERS.WAITER_NAWAZ;
        } else {
          return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }
      }
    }

    // Anything else trying to login is strictly rejected
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
    }

    // Issue 1-Year JWT Token
    const token = createSessionToken(authUser);

    // Set 1-Year persistent cookies
    const cookieOptions = {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
      httpOnly: false,
      sameSite: 'lax',
      path: '/'
    };

    if (authUser.role === 'WAITER' || portal === 'waiter') {
      res.cookie('spice_waiter_token', token, cookieOptions);
      res.cookie('spice_token', token, cookieOptions);
    } else if (authUser.role === 'ADMIN' || portal === 'admin') {
      res.cookie('spice_admin_token', token, cookieOptions);
      res.cookie('spice_token', token, cookieOptions);
    } else {
      res.cookie('spice_token', token, cookieOptions);
    }
    res.cookie('spice_session_id', token, cookieOptions);

    res.json({
      success: true,
      token,
      sessionId: token,
      session_id: token,
      user: authUser
    });
  } catch (err) {
    console.error('Auth login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/session - Retrieve and validate persistent session token
router.get('/auth/session', (req, res) => {
  const portalContext = req.headers['x-portal'] || req.query?.portal || '';
  const targetRole = portalContext === 'waiter' ? 'WAITER' : (portalContext === 'admin' ? 'ADMIN' : null);
  const auth = verifyUserToken(req, targetRole);
  if (!auth || !auth.user) {
    return res.json({ success: true, authenticated: false, user: null });
  }
  res.json({
    success: true,
    authenticated: true,
    token: auth.token,
    sessionId: auth.token,
    session_id: auth.token,
    user: auth.user
  });
});

// POST /api/auth/logout - Immediately kill session, revoke JWT, and clear cookies
router.post('/auth/logout', (req, res) => {
  const portal = req.body?.portal || req.headers['x-portal'] || req.query?.portal || '';
  const targetRole = portal === 'waiter' ? 'WAITER' : (portal === 'admin' ? 'ADMIN' : null);
  const auth = verifyUserToken(req, targetRole);
  const tokenFromBody = req.body?.token || req.body?.sessionId || req.body?.session_id;

  const tokensToRevoke = [];
  if (auth?.token) tokensToRevoke.push(auth.token);
  if (auth?.user?.jti) tokensToRevoke.push(auth.user.jti);
  if (tokenFromBody) tokensToRevoke.push(tokenFromBody);

  if (portal === 'waiter' || auth?.user?.role === 'WAITER') {
    if (req.cookies?.spice_waiter_token) tokensToRevoke.push(req.cookies.spice_waiter_token);
  } else if (portal === 'admin' || auth?.user?.role === 'ADMIN') {
    if (req.cookies?.spice_admin_token) tokensToRevoke.push(req.cookies.spice_admin_token);
  } else {
    if (req.cookies?.spice_token) tokensToRevoke.push(req.cookies.spice_token);
    if (req.cookies?.spice_session_id) tokensToRevoke.push(req.cookies.spice_session_id);
    if (req.cookies?.spice_waiter_token) tokensToRevoke.push(req.cookies.spice_waiter_token);
    if (req.cookies?.spice_admin_token) tokensToRevoke.push(req.cookies.spice_admin_token);
  }

  for (const t of tokensToRevoke) {
    if (t) localStore.revokeToken(t);
  }

  const clearCookieOptions = {
    path: '/',
    sameSite: 'lax',
    httpOnly: false
  };

  if (portal === 'waiter' || auth?.user?.role === 'WAITER') {
    res.clearCookie('spice_waiter_token', clearCookieOptions);
  } else if (portal === 'admin' || auth?.user?.role === 'ADMIN') {
    res.clearCookie('spice_admin_token', clearCookieOptions);
  } else {
    res.clearCookie('spice_waiter_token', clearCookieOptions);
    res.clearCookie('spice_admin_token', clearCookieOptions);
    res.clearCookie('spice_token', clearCookieOptions);
    res.clearCookie('spice_session_id', clearCookieOptions);
  }

  res.json({
    success: true,
    message: 'Session terminated and credentials revoked.'
  });
});

// POST /api/auth/kill-all-sessions - Authoritatively delete all active sessions & JWTs globally
router.post('/auth/kill-all-sessions', (req, res) => {
  const state = sessionManager.killAllSessions();
  broadcastEvent('FORCE_SIGNOUT', {
    type: 'FORCE_SIGNOUT',
    sessionEpoch: state.sessionEpoch,
    reason: 'All active sessions destroyed by system.'
  });
  res.json({
    success: true,
    message: 'All active sessions and JWTs have been permanently destroyed and all users signed out.',
    sessionEpoch: state.sessionEpoch
  });
});

// GET /api/config - Safe public client configuration
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      isConfigured: dbService.isConfigured(),
      timezone: process.env.TIMEZONE || 'Asia/Kolkata',
      restaurant: {
        name: 'SPICE & SKY ROOFTOP CAFE',
        tagline: 'Rooftop Vibes, Bold Flavors & Cozy Brews',
        phone: '+91 85228 80017',
        phoneAlt: '+91 63090 80400',
        email: 'support@spiceandskycafe.com',
        instagram: '@spicensky',
        instagramUrl: 'https://www.instagram.com/spicensky',
        hours: '1:00 PM – 02:00 AM (All Days)',
        tablesCount: 9,
        mapsUrl: 'https://maps.app.goo.gl/mBJKxafpcMmyCyCb8'
      }
    }
  });
});

// GET /api/events - Realtime SSE stream
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (res.flushHeaders) res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', time: new Date().toISOString(), sessionEpoch: sessionManager.getEpoch() })}\n\n`);
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch (e) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// GET /api/menu - Public menu catalog
router.get('/menu', async (req, res) => {
  try {
    const includeArchived = req.query.include_archived === 'true';
    const categories = await dbService.getCategories();
    const items = await dbService.getMenuItems(includeArchived);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      success: true,
      data: {
        categories,
        items
      }
    });
  } catch (err) {
    console.error('API /menu error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders - Waiter atomic order submission
router.post('/orders', requireAuth(['WAITER', 'ADMIN']), async (req, res) => {
  try {
    const { table_number, items, notes, idempotency_key, waiter_name, waiter_id } = req.body;

    if (!table_number) {
      return res.status(400).json({ success: false, error: 'Table number is required.' });
    }
    if (!items || !items.length) {
      return res.status(400).json({ success: false, error: 'Order items are required.' });
    }

    const order = await dbService.createOrderAtomic({
      table_number,
      items,
      notes,
      idempotency_key,
      waiter_id: waiter_id || req.user?.id,
      waiter_name: waiter_name || req.user?.username || req.user?.display_name || 'waiter',
      payment_mode: req.body.payment_mode,
      cash_amount: req.body.cash_amount,
      online_amount: req.body.online_amount
    });

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (err) {
    console.error('API POST /orders error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/orders/active - List currently serving active orders
router.get('/orders/active', requireAuth(['WAITER', 'ADMIN']), async (req, res) => {
  try {
    const active = await dbService.getActiveServingOrders();
    res.json({ success: true, data: active });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/orders - Staff/Admin order listing
router.get('/orders', requireAuth(['WAITER', 'ADMIN']), async (req, res) => {
  try {
    const orders = await dbService.getOrders(req.query);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/orders/:id - Order details
router.get('/orders/:id', requireAuth(['WAITER', 'ADMIN']), async (req, res) => {
  try {
    const order = await dbService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/orders/:id - Edit order items / bill
router.put('/orders/:id', requireAuth(['WAITER', 'ADMIN']), async (req, res) => {
  try {
    const { items, notes, waiter_id, waiter_name, status } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ success: false, error: 'Order items are required.' });
    }
    const updated = await dbService.updateOrderItems(req.params.id, {
      items,
      notes,
      waiter_id: waiter_id || req.user?.id,
      waiter_name: waiter_name || req.user?.username || req.user?.display_name || 'waiter',
      status
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('API PUT /orders/:id error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:id/complete - Complete order & finalize bill with payment breakdown
router.post('/orders/:id/complete', requireAuth(['WAITER', 'ADMIN']), async (req, res) => {
  try {
    const existingOrder = await dbService.getOrderById(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    const orderTotal = Number(existingOrder.total || 0);
    let payment_mode = req.body.payment_mode ? String(req.body.payment_mode).toUpperCase() : 'ONLINE';
    let cash_amount = 0;
    let online_amount = 0;

    if (req.body.cash_amount !== undefined && req.body.cash_amount !== null) {
      const inputCash = Math.round(Number(req.body.cash_amount) * 100) / 100;
      if (inputCash < 0) {
        return res.status(400).json({ success: false, error: 'Cash amount cannot be negative.' });
      }
      if (inputCash > orderTotal) {
        return res.status(400).json({
          success: false,
          error: `Cash amount (₹${inputCash}) cannot exceed order total (₹${orderTotal}).`
        });
      }

      // If online_amount was also explicitly supplied, ensure the sum equals total
      if (req.body.online_amount !== undefined && req.body.online_amount !== null) {
        const inputOnline = Math.round(Number(req.body.online_amount) * 100) / 100;
        if (Math.abs((inputCash + inputOnline) - orderTotal) > 0.01) {
          return res.status(400).json({
            success: false,
            error: `Split amounts (Cash: ₹${inputCash} + Online: ₹${inputOnline} = ₹${inputCash + inputOnline}) must equal total order amount (₹${orderTotal}).`
          });
        }
        online_amount = inputOnline;
      } else {
        online_amount = Math.round((orderTotal - inputCash) * 100) / 100;
      }

      cash_amount = inputCash;

      if (cash_amount >= orderTotal) {
        payment_mode = 'CASH';
        cash_amount = orderTotal;
        online_amount = 0;
      } else if (cash_amount <= 0) {
        payment_mode = 'ONLINE';
        cash_amount = 0;
        online_amount = orderTotal;
      } else {
        payment_mode = 'SPLIT';
      }
    } else {
      const validModes = ['CASH', 'ONLINE', 'SPLIT'];
      if (!validModes.includes(payment_mode)) {
        payment_mode = 'ONLINE';
      }

      if (payment_mode === 'CASH') {
        cash_amount = orderTotal;
        online_amount = 0;
      } else if (payment_mode === 'ONLINE') {
        cash_amount = 0;
        online_amount = orderTotal;
      } else if (payment_mode === 'SPLIT') {
        cash_amount = Number(req.body.cash_amount) || 0;
        online_amount = Number(req.body.online_amount) || 0;

        if (Math.abs((cash_amount + online_amount) - orderTotal) > 0.01) {
          return res.status(400).json({
            success: false,
            error: `Split amounts (Cash: ₹${cash_amount} + Online: ₹${online_amount} = ₹${cash_amount + online_amount}) must equal total order amount (₹${orderTotal}).`
          });
        }
      }
    }

    const paymentData = {
      payment_mode,
      cash_amount,
      online_amount,
      payment_status: 'PAID'
    };

    await dbService.updateOrderStatus(req.params.id, 'COMPLETED', paymentData);
    const order = await dbService.getOrderById(req.params.id);
    res.json({
      success: true,
      data: {
        ...(order || {}),
        ...paymentData
      }
    });
  } catch (err) {
    console.error('API POST /orders/:id/complete error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/orders/:id/status - Update status
router.patch('/orders/:id/status', requireAuth(['WAITER', 'ADMIN']), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status.' });
    }
    const paymentData = {};
    if (status === 'CANCELLED') {
      paymentData.payment_status = 'CANCELLED';
    } else if (status === 'COMPLETED') {
      paymentData.payment_status = 'PAID';
    }
    const updated = await dbService.updateOrderStatus(req.params.id, status, paymentData);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/admin/menu/upload-image - Upload menu item image
router.post('/admin/menu/upload-image', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { image_data, filename, content_type } = req.body;
    if (!image_data) {
      return res.status(400).json({ success: false, error: 'No image data provided.' });
    }

    let buffer;
    let mimeType = content_type || 'image/webp';

    if (typeof image_data === 'string' && image_data.startsWith('data:')) {
      const matches = image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        return res.status(400).json({ success: false, error: 'Invalid data URL format.' });
      }
    } else if (typeof image_data === 'string') {
      buffer = Buffer.from(image_data, 'base64');
    } else {
      return res.status(400).json({ success: false, error: 'image_data must be base64 string or data URL.' });
    }

    const safeFilename = filename || `menu-item-${Date.now()}.${mimeType.split('/')[1] || 'webp'}`;
    const result = await dbService.uploadMenuItemImage(safeFilename, buffer, mimeType);
    res.json({ success: true, image_url: result.image_url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/menu - Admin add menu item
router.post('/admin/menu', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const item = await dbService.addMenuItem(req.body);
    broadcastEvent('MENU_UPDATED', { type: 'INSERT', item });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/menu/:id - Admin update menu item
router.patch('/admin/menu/:id', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const updated = await dbService.updateMenuItem(req.params.id, req.body);
    broadcastEvent('MENU_UPDATED', { type: 'UPDATE', item: updated });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/menu/:id - Admin archive menu item (soft delete) or permanent delete
router.delete('/admin/menu/:id', requireAuth(['ADMIN']), async (req, res) => {
  try {
    if (req.query.permanent === 'true') {
      const deleted = await dbService.deleteMenuItem(req.params.id);
      broadcastEvent('MENU_UPDATED', { type: 'DELETE', id: req.params.id });
      return res.json({ success: true, data: deleted, message: 'Item permanently deleted from database.' });
    }
    const archived = await dbService.archiveMenuItem(req.params.id);
    broadcastEvent('MENU_UPDATED', { type: 'ARCHIVE', item: archived });
    res.json({ success: true, data: archived, message: 'Item archived successfully.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/menu/:id/permanent - Admin permanent delete menu item
router.delete('/admin/menu/:id/permanent', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const deleted = await dbService.deleteMenuItem(req.params.id);
    broadcastEvent('MENU_UPDATED', { type: 'DELETE', id: req.params.id });
    res.json({ success: true, data: deleted, message: 'Item permanently deleted from database.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/admin/menu/:id/restore - Admin restore archived menu item
router.post('/admin/menu/:id/restore', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const restored = await dbService.restoreMenuItem(req.params.id);
    broadcastEvent('MENU_UPDATED', { type: 'RESTORE', item: restored });
    res.json({ success: true, data: restored, message: 'Item restored successfully.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/admin/categories - Admin create new menu category
router.post('/admin/categories', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const { name, slug, display_order } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required.' });
    }
    const newCat = await dbService.createCategory({ name, slug, display_order });
    res.status(201).json({ success: true, data: newCat, message: 'Category created successfully.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/admin/analytics - Admin analytics data
router.get('/admin/analytics', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const analytics = await dbService.getAnalytics();
    res.json({ success: true, data: analytics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/orders/reset - Reset all order history (Admin only)
router.post('/admin/orders/reset', requireAuth(['ADMIN']), async (req, res) => {
  try {
    await dbService.resetAllOrderHistory();
    broadcastEvent('ORDER_UPDATED', { type: 'RESET' });
    res.json({ success: true, message: 'All order history has been successfully reset.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/orders/reset-today - Erase today's order history only (Admin only)
router.post('/admin/orders/reset-today', requireAuth(['ADMIN']), async (req, res) => {
  try {
    const result = await dbService.resetTodayOrderHistory();
    broadcastEvent('ORDER_UPDATED', { type: 'RESET_TODAY' });
    res.json({
      success: true,
      message: `Today's order history (${result.erasedCount || 0} orders) has been successfully erased.`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.verifyUserToken = verifyUserToken;

module.exports = router;

