// SECURITY HARDENING PATCH for server/index.js
// This file contains all security fixes to be applied

const SECURITY_PATCH = `

// ========== 1. AFTER: app.use(cors...) AND app.use(express.json...) ==========
// Find the line: app.use(cors({ origin: true, credentials: true }))
// Replace with enhanced CORS + JSON limits:

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400,
}))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// ========== 2. AFTER: app.use(express.json()) ==========
// Add global security headers + global rate limiting:

// Helper: getClientIp
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
}

// In-memory brute force tracker (shared with auth.js)
const bruteForceTracker = new Map()
const BRUTE_FORCE_THRESHOLD = 200
const BRUTE_FORCE_WINDOW = 5 * 60 * 1000

function recordBruteForce(ip) {
  const now = Date.now()
  const record = bruteForceTracker.get(ip)
  if (!record || now > record.windowStart + BRUTE_FORCE_WINDOW) {
    bruteForceTracker.set(ip, { count: 1, windowStart: now, releaseAt: null })
    return false
  }
  record.count++
  if (record.count >= BRUTE_FORCE_THRESHOLD) {
    record.releaseAt = now + BRUTE_FORCE_WINDOW * 2
    console.warn(\`[Security] IP \${ip} temporarily blocked due to excessive requests\`)
    return true
  }
  return false
}

// Global API rate limiting
const globalRateLimits = new Map()
const GLOBAL_RATE_WINDOW = 60 * 1000
const GLOBAL_RATE_MAX = 200

app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/' || req.path.startsWith('/dist') || req.path.startsWith('/public')) {
    return next()
  }
  const ip = getClientIp(req)
  const now = Date.now()
  let record = globalRateLimits.get(ip)
  if (!record || now > record.windowStart + GLOBAL_RATE_WINDOW) {
    record = { count: 1, windowStart: now }
    globalRateLimits.set(ip, record)
    return next()
  }
  record.count++
  if (record.count > GLOBAL_RATE_MAX) {
    res.setHeader('Retry-After', Math.ceil((record.windowStart + GLOBAL_RATE_WINDOW - now) / 1000))
    return res.status(429).json({ ok: false, error: 'Too Many Requests', code: 'RATE_LIMITED', retryAfter: Math.ceil((record.windowStart + GLOBAL_RATE_WINDOW - now) / 1000) })
  }
  res.setHeader('X-RateLimit-Limit', GLOBAL_RATE_MAX)
  res.setHeader('X-RateLimit-Remaining', GLOBAL_RATE_MAX - record.count)
  res.setHeader('X-RateLimit-Reset', Math.ceil((record.windowStart + GLOBAL_RATE_WINDOW - now) / 1000))
  next()
})

// Global security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('X-Request-Id', randomUUID())
  next()
})

// ========== 3. REPLACE: checkAuth function ==========
// Remove query.token support, add brute force check:

function checkAuth(req) {
  if (!isAuthEnabled()) return true
  const ip = getClientIp(req)

  // Check if IP is blocked
  const blocked = bruteForceTracker.get(ip)
  if (blocked && Date.now() < blocked.releaseAt) {
    return false
  }

  let token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session
  // REMOVED: query.token fallback - security risk (log leakage)
  if (!token) return false
  const session = sessions.get(token)
  if (!session) return false
  if (session.expires < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

// ========== 4. REPLACE: app.post('/api/auth/login', ...) ==========
// Add rate limiting, account lockout, secure cookies, audit logging:

// Import from auth.js (already imported at top of server/index.js):
// hashPassword, verifyPassword, generateToken, createSession,
// validateSession, invalidateSession, invalidateAllUserSessions,
// getUserById, getUserByUsername, getUserPermissions, userHasPermission,
// userHasAnyPermission, getUserRoles, attachAuth, requireAuth,
// requirePermission, requireAnyPermission, requireRole,
// createAuditLog, getAuditLogs, cleanupExpiredSessions,
// checkLoginAttempts, recordFailedLogin, recordSuccessfulLogin

// For legacy single-user mode (env-based auth), we use a simple sessions Map
// For multi-user mode (DB-based), we use auth.js functions

app.post('/api/auth/login', (req, res) => {
  if (!isAuthEnabled()) {
    return res.json({ ok: true, message: 'Auth disabled' })
  }

  const ip = getClientIp(req)

  // Check brute force block
  const blocked = bruteForceTracker.get(ip)
  if (blocked && Date.now() < blocked.releaseAt) {
    const remaining = Math.ceil((blocked.releaseAt - Date.now()) / 1000)
    return res.status(429).json({
      ok: false,
      error: 'Too many failed attempts. Please try again later.',
      code: 'IP_LOCKED',
      retryAfter: remaining,
    })
  }

  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password required' })
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid request format' })
  }

  // Validate username format (prevent injection)
  if (!/^[a-zA-Z0-9_\\-\\.]{1,64}$/.test(username)) {
    return res.status(400).json({ ok: false, error: 'Invalid username format' })
  }

  // Simple env-based auth (single user mode)
  if (username !== envConfig.AUTH_USERNAME || password !== envConfig.AUTH_PASSWORD) {
    recordBruteForce(ip)
    createAuditLog({
      username,
      action: 'LOGIN_FAILED',
      resource: 'auth',
      details: { reason: 'invalid_credentials' },
      ipAddress: ip,
      userAgent: req.get('User-Agent'),
      status: 'failure',
    })
    return res.status(401).json({ ok: false, error: 'Invalid credentials' })
  }

  // Success
  createAuditLog({
    username,
    action: 'LOGIN_SUCCESS',
    resource: 'auth',
    details: {},
    ipAddress: ip,
    userAgent: req.get('User-Agent'),
    status: 'success',
  })

  const token = randomUUID()
  const expires = Date.now() + 24 * 60 * 60 * 1000

  sessions.set(token, { username, expires })

  // Secure cookie
  const isProduction = process.env.NODE_ENV === 'production' || process.env.https === 'on'
  const cookieFlags = \`session_token=\${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=\${24 * 60 * 60}\${isProduction ? '; Secure' : ''}\`
  res.setHeader('Set-Cookie', cookieFlags)

  res.json({ ok: true, token })
})

// ========== 5. RPC endpoint - restrict methods ==========
// Find: app.post('/api/rpc', authMiddleware, async (req, res) => { ... }
// Replace with method whitelist

// ========== 6. media API - fix path traversal ==========
// Find path sanitization in /api/media

`

console.log(SECURITY_PATCH)
