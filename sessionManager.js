const crypto = require('crypto');

// Encryption settings
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-fallback-encryption-key-32-chars'; // Must be 32 bytes for AES-256
const IV_LENGTH = 16; // For AES, this is always 16 bytes

// In-memory session storage (would use a database in production)
const sessions = {};

// Session expiration time (7 days in milliseconds)
const SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000;

// Generate a random session token
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Encrypt sensitive data
const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

// Decrypt sensitive data
const decrypt = (text) => {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

// Session management functions
const sessionManager = {
  // Create a new session
  createSession: (userId, credentials) => {
    const sessionToken = generateSessionToken();
    const now = Date.now();
    const expiresAt = now + SESSION_EXPIRY;
    
    // Encrypt sensitive credentials
    const encryptedApiKey = encrypt(credentials.apiKey);
    const encryptedSecretKey = encrypt(credentials.secretKey);
    
    // Store session data
    sessions[sessionToken] = {
      userId,
      exchange: credentials.exchange,
      apiKey: encryptedApiKey,
      secretKey: encryptedSecretKey,
      createdAt: now,
      expiresAt
    };
    
    return {
      sessionToken,
      expiresAt
    };
  },
  
  // Get session data
  getSession: (sessionToken) => {
    const session = sessions[sessionToken];
    
    if (!session) {
      return null;
    }
    
    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      delete sessions[sessionToken];
      return null;
    }
    
    return {
      userId: session.userId,
      exchange: session.exchange,
      expiresAt: session.expiresAt
    };
  },
  
  // Get API keys from session
  getApiKeys: (sessionToken) => {
    const session = sessions[sessionToken];
    
    if (!session) {
      return null;
    }
    
    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      delete sessions[sessionToken];
      return null;
    }
    
    // Decrypt API keys
    const apiKey = decrypt(session.apiKey);
    const secretKey = decrypt(session.secretKey);
    
    return {
      exchange: session.exchange,
      apiKey,
      secretKey
    };
  },
  
  // Delete session
  deleteSession: (sessionToken) => {
    if (sessions[sessionToken]) {
      delete sessions[sessionToken];
      return true;
    }
    return false;
  },
  
  // Get all sessions for a user
  getUserSessions: (userId) => {
    return Object.entries(sessions)
      .filter(([_, session]) => session.userId === userId)
      .map(([token, session]) => ({
        sessionToken: token,
        exchange: session.exchange,
        expiresAt: session.expiresAt
      }));
  }
};

module.exports = sessionManager;
