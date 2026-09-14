/**
 * Authoritative Session & JWT Key Manager for Spice & Sky Rooftop Cafe
 * Handles dynamic secret rotation, epoch tracking, and global session termination.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, 'session_state.json');

class SessionManager {
  constructor() {
    this.sessionEpoch = 0;
    this.jwtSecret = '';
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
      console.warn('Session state file could not be read, resetting state:', e.message);
    }
    this.killAllSessions();
  }

  saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        sessionEpoch: this.sessionEpoch,
        jwtSecret: this.jwtSecret,
        terminatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to write session state file:', e);
    }
  }

  killAllSessions() {
    this.sessionEpoch = Date.now();
    this.jwtSecret = 'spice_sky_' + Date.now() + '_' + crypto.randomBytes(32).toString('hex');
    this.saveState();
    console.log(`[SessionManager] All sessions & JWT tokens killed. New Epoch: ${this.sessionEpoch}`);
    return {
      sessionEpoch: this.sessionEpoch,
      jwtSecret: this.jwtSecret
    };
  }

  getSecret() {
    if (!this.jwtSecret) this.killAllSessions();
    return this.jwtSecret;
  }

  getEpoch() {
    if (!this.sessionEpoch) this.killAllSessions();
    return this.sessionEpoch;
  }
}

const sessionManager = new SessionManager();
module.exports = sessionManager;
