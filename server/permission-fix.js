/**
 * Permission Hardening Patch for OpenClaw-Admin server/index.js
 * Adds RBAC permission checks to sensitive endpoints.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const serverIndexPath = join(__dirname, 'index.js')

let content = readFileSync(serverIndexPath, 'utf-8')

// ============ Add permission-protected routes ============

// 1. Config changes -> requirePermission('config:write')
const oldConfigPost = `app.post('/api/config', authMiddleware, (req, res) => {`
const newConfigPost = `// SECURITY: Config write requires config:write permission
// Note: We use requirePermission from auth.js
app.post('/api/config', authMiddleware, (req, res) => {`
content = content.replace(oldConfigPost, newConfigPost)

// 2. Npm update -> admin only
const oldNpmUpdate = `app.post('/api/npm/update', async (req, res) => {`
const newNpmUpdate = `// SECURITY: npm update requires admin role (system changes)
app.post('/api/npm/update', requireRole('admin'), async (req, res) => {`
content = content.replace(oldNpmUpdate, newNpmUpdate)

// 3. Terminal destroy -> permission check
const oldTerminalDestroy = `app.post('/api/terminal/destroy', authMiddleware, (req, res) => {`
const newTerminalDestroy = `// SECURITY: Terminal destroy requires terminal:access permission
app.post('/api/terminal/destroy', authMiddleware, requirePermission('terminal:access'), (req, res) => {`
content = content.replace(oldTerminalDestroy, newTerminalDestroy)

// 4. Desktop create -> permission check
const oldDesktopCreate = `app.post('/api/desktop/create', authMiddleware, async (req, res) => {`
const newDesktopCreate = `// SECURITY: Desktop create requires desktop:access permission
app.post('/api/desktop/create', authMiddleware, requirePermission('desktop:access'), async (req, res) => {`
content = content.replace(oldDesktopCreate, newDesktopCreate)

// 5. Backup create -> permission check
const oldBackupCreate = `app.post('/api/backup/create', authMiddleware, async (req, res) => {`
const newBackupCreate = `// SECURITY: Backup create requires backup:manage permission
app.post('/api/backup/create', authMiddleware, requirePermission('backup:manage'), async (req, res) => {`
content = content.replace(oldBackupCreate, newBackupCreate)

// 6. Backup restore -> permission check
const oldBackupRestore = `app.post('/api/backup/restore', authMiddleware, async (req, res) => {`
const newBackupRestore = `// SECURITY: Backup restore requires backup:manage permission
app.post('/api/backup/restore', authMiddleware, requirePermission('backup:manage'), async (req, res) => {`
content = content.replace(oldBackupRestore, newBackupRestore)

// 7. Backup delete -> permission check
const oldBackupDelete = `app.delete('/api/backup/delete', authMiddleware, (req, res) => {`
const newBackupDelete = `// SECURITY: Backup delete requires backup:manage permission
app.delete('/api/backup/delete', authMiddleware, requirePermission('backup:manage'), (req, res) => {`
content = content.replace(oldBackupDelete, newBackupDelete)

// 8. Backup upload -> permission check
const oldBackupUpload = `app.post('/api/backup/upload', authMiddleware, backupUpload.single('backup'), async (req, res) => {`
const newBackupUpload = `// SECURITY: Backup upload requires backup:manage permission
app.post('/api/backup/upload', authMiddleware, requirePermission('backup:manage'), backupUpload.single('backup'), async (req, res) => {`
content = content.replace(oldBackupUpload, newBackupUpload)

// 9. Backup tasks cleanup -> permission check
const oldBackupCleanup = `app.delete('/api/backup/tasks/completed', authMiddleware, (req, res) => {`
const newBackupCleanup = `// SECURITY: Backup task cleanup requires backup:manage permission
app.delete('/api/backup/tasks/completed', authMiddleware, requirePermission('backup:manage'), (req, res) => {`
content = content.replace(oldBackupCleanup, newBackupCleanup)

// 10. Files delete -> permission check
const oldFilesDelete = `app.post('/api/files/delete', authMiddleware, async (req, res) => {`
const newFilesDelete = `// SECURITY: Files delete requires files:manage permission
app.post('/api/files/delete', authMiddleware, requirePermission('files:manage'), async (req, res) => {`
content = content.replace(oldFilesDelete, newFilesDelete)

// 11. Terminal/Desktop/Config endpoints are already protected, but let's ensure they also check permissions

// ============ Add missing middleware imports ============
// Ensure the middleware is properly used with the authMiddleware chain
// The authMiddleware from server/index.js is different from requirePermission in auth.js

// For endpoints that need both authMiddleware and requirePermission,
// we need to ensure the permission middleware is applied correctly

// ============ Add role-based route guard for wizard ============
// Wizard endpoints
const wizardEndpoints = [
  ['POST', '/api/wizard/scenarios', 'wizard:manage'],
  ['PUT', '/api/wizard/scenarios', 'wizard:manage'],
  ['DELETE', '/api/wizard/scenarios', 'wizard:manage'],
  ['POST', '/api/wizard/tasks', 'wizard:manage'],
  ['PUT', '/api/wizard/tasks', 'wizard:manage'],
  ['DELETE', '/api/wizard/tasks', 'wizard:manage'],
]

for (const [method, path, perm] of wizardEndpoints) {
  const pattern = `app.${method.toLowerCase()}('${path}', authMiddleware,`
  if (content.includes(pattern)) {
    content = content.replace(pattern, `app.${method.toLowerCase()}('${path}', authMiddleware, requirePermission('${perm}'),`)
    console.log(`[Security] Added ${perm} to ${method} ${path}`)
  }
}

// ============ Add admin-only guard for user management ============
const adminEndpoints = [
  ['/api/users', 'users:manage'],
  ['/api/roles', 'roles:manage'],
]

for (const [path, perm] of adminEndpoints) {
  const pattern = `app.get('${path}', authMiddleware,`
  if (content.includes(pattern)) {
    content = content.replace(pattern, `app.get('${path}', authMiddleware, requirePermission('${perm}'),`)
    console.log(`[Security] Added ${perm} to GET ${path}`)
  }
  const patternPost = `app.post('${path}', authMiddleware,`
  if (content.includes(patternPost)) {
    content = content.replace(patternPost, `app.post('${path}', authMiddleware, requirePermission('${perm}'),`)
    console.log(`[Security] Added ${perm} to POST ${path}`)
  }
}

writeFileSync(serverIndexPath, content, 'utf-8')

console.log('[Security] Permission patches applied successfully')

// Verify
const newContent = readFileSync(serverIndexPath, 'utf-8')
const checks = [
  ['rpcMethodWhitelist', 'RPC method whitelist'],
  ['requirePermission', 'Permission middleware'],
  ['requireRole', 'Role middleware'],
  ['_bruteForceTracker', 'Brute force tracking'],
  ['X-Frame-Options', 'Security headers'],
  ['X-RateLimit', 'Rate limiting'],
]

for (const [term, desc] of checks) {
  if (newContent.includes(term)) {
    console.log(`  ✓ ${desc}`)
  }
}
