/**
 * Authoritative Session & JWT Key Manager for Spice & Sky Rooftop Cafe
 * Handles persistent secret management, epoch tracking, and global session termination.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, 'session_state.json');
const STABLE_JWT_SECRET = process.env.JWT_SECRET || 'spice_sky_jwt_secret_2026_super_secure_permanent_key';
const STABLE_EPOCH = 1789380855923;

class SessionManager {
  constructor() {
    this.sessionEpoch = STABLE_EPOCH;
    this.jwtSecret = STABLE_JWT_SECRET;
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data.sessionEpoch && data.jwtSecret) {
          this.sessionEpoch = Number(data.sessionEpoch);
          this.jwtSecret = String(data.jwtSecret);
          return;
        }
      }
    } catch (e) {
      console.warn('Session state file notice:', e.message);
    }
    // Maintain stable defaults so serverless cold starts never invalidate active sessions
    this.sessionEpoch = STABLE_EPOCH;
    this.jwtSecret = STABLE_JWT_SECRET;
  }

  saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        sessionEpoch: this.sessionEpoch,
        jwtSecret: this.jwtSecret,
        terminatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
    } catch (e) {
      // Safe fallback on read-only serverless filesystems
    }
  }

  killAllSessions() {
    this.sessionEpoch = Date.now();
    this.jwtSecret = 'spice_sky_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex');
    this.saveState();
    console.log(`[SessionManager] All sessions & JWT tokens killed. New Epoch: ${this.sessionEpoch}`);
    return {
      sessionEpoch: this.sessionEpoch,
      jwtSecret: this.jwtSecret
    };
  }

  getSecret() {
    return this.jwtSecret || STABLE_JWT_SECRET;
  }

  getEpoch() {
    return this.sessionEpoch || STABLE_EPOCH;
  }
}

const sessionManager = new SessionManager();
module.exports = sessionManager;
