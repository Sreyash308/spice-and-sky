/**
 * SPICE & SKY ROOFTOP CAFE - SERVER GATEWAY
 * "Rooftop Vibes, Bold Flavors & Cozy Brews"
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 8000;

// Security Headers with Helmet tailored for Supabase API, Realtime WSS & Google Fonts
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdn.jsdelivr.net"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "data:"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "blob:"
        ],
        connectSrc: [
          "'self'",
          "https://*.supabase.co",
          "wss://*.supabase.co",
          "ws:",
          "wss:"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Assets with optimized cache headers for fast image and asset rendering
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
app.use('/images', express.static(path.join(__dirname, 'public', 'images'), {
  maxAge: THIRTY_DAYS_MS,
  immutable: true
}));
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), {
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), {
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    cafe: 'Spice & Sky Rooftop Cafe',
    timestamp: new Date().toISOString()
  });
});

// Mount API Endpoints
app.use('/api', apiRouter);

// Clean Route Handlers for the 3 Web Experiences
app.get('/', (req, res) => {
  res.redirect('/menu');
});

// 1. Public Customer Menu
app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

// 2. Waiter Order / Billing POS
app.get('/waiter/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.query.logout === 'true' || req.query.clear === 'true') {
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
  }
  res.sendFile(path.join(__dirname, 'public', 'waiter-login.html'));
});

app.get('/waiter', (req, res) => {
  const auth = apiRouter.verifyUserToken ? apiRouter.verifyUserToken(req) : null;
  const ALLOWED_USERS = ['shan', 'yawar', 'nawaz'];
  const uname = auth?.user?.username ? auth.user.username.toLowerCase() : (auth?.user?.display_name ? auth.user.display_name.toLowerCase() : '');

  // Only allow Shan, Yawar, and Nawaz with role WAITER into the Waiter Terminal
  if (!auth || !auth.user || auth.user.role !== 'WAITER' || !ALLOWED_USERS.includes(uname)) {
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
    res.clearCookie('spice_token', { path: '/' });
    res.clearCookie('spice_session_id', { path: '/' });
    return res.redirect('/waiter/login?logout=true&t=' + Date.now());
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'waiter.html'));
});

// 3. Owner / Admin Dashboard
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get(['/admin', '/admin/orders', '/admin/menu', '/admin/analytics', '/admin/tables', '/admin/settings'], (req, res) => {
  const auth = apiRouter.verifyUserToken ? apiRouter.verifyUserToken(req) : null;
  const uname = auth?.user?.username ? auth.user.username.toLowerCase() : (auth?.user?.display_name ? auth.user.display_name.toLowerCase() : '');
  if (!auth || !auth.user || auth.user.role !== 'ADMIN' || uname !== 'admin@143') {
    return res.redirect('/admin/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n============================================================`);
    console.log(` SPICE & SKY ROOFTOP CAFE`);
    console.log(` "Rooftop Vibes, Bold Flavors & Cozy Brews"`);
    console.log(`============================================================`);
    console.log(`🚀 Server running at: http://localhost:${PORT}`);
    console.log(`📱 1. Public Customer Menu:   http://localhost:${PORT}/menu`);
    console.log(`👔 2. Waiter POS Terminal:    http://localhost:${PORT}/waiter`);
    console.log(`📊 3. Owner Admin Dashboard:  http://localhost:${PORT}/admin`);
    console.log(`============================================================\n`);
  });
}

module.exports = app;
