import { Router } from 'express';
import {
  clearFailedAttempts,
  forgetCachedUser,
  issueToken,
  recordFailedAttempt,
  requireAdmin,
  setSessionCookie,
  tooManyAttempts,
} from '../auth.js';
import {
  ROLES,
  checkPassword,
  countActiveAdmins,
  createUser,
  deleteUser,
  getUserById,
  getUserByUsername,
  listUsers,
  normalizeUsername,
  publicUser,
  setPassword,
  updateUser,
  validatePassword,
  validateUsername,
} from '../users.js';

const router = Router();

function log(req, msg) {
  console.log(`[users] ${req.user?.username || '?'}: ${msg}`);
}

// ---------------------------------------------------------------------------
// The signed-in user
// ---------------------------------------------------------------------------

router.get('/me', (req, res) => {
  res.json(req.user);
});

/** Change your own password (needs the current one). Signs you out everywhere else. */
router.put('/me/password', async (req, res) => {
  if (tooManyAttempts(req, res)) return;
  const { currentPassword, newPassword } = req.body || {};
  const user = await getUserById(req.user.id);
  if (!(await checkPassword(user, String(currentPassword || '')))) {
    recordFailedAttempt(req);
    // 403, not 401: a wrong current password must not sign this screen out.
    return res.status(403).json({ error: 'Current password is incorrect' });
  }
  clearFailedAttempts(req);
  const problem = validatePassword(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  if (await checkPassword(user, String(newPassword))) {
    return res.status(400).json({ error: 'Choose a password different from the current one' });
  }
  const updated = await setPassword(user.id, String(newPassword));
  forgetCachedUser(user.id);
  log(req, 'changed own password');
  // Every other session is now invalid; give this browser a fresh cookie so it stays in.
  const { token, expiresAt } = await issueToken(updated);
  setSessionCookie(req, res, token, expiresAt);
  res.json({ ok: true, expiresAt, user: publicUser(updated) });
});

// ---------------------------------------------------------------------------
// Managing users (administrators only)
// ---------------------------------------------------------------------------

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  res.json(await listUsers());
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const username = normalizeUsername(body.username);
  const fullName = String(body.fullName || '').trim();
  const role = ROLES.includes(body.role) ? body.role : 'staff';
  const problem =
    validateUsername(username) ||
    (!fullName ? 'Full name is required' : null) ||
    (fullName.length > 128 ? 'Full name is too long' : null) ||
    validatePassword(body.password);
  if (problem) return res.status(400).json({ error: problem });
  if (await getUserByUsername(username)) {
    return res.status(400).json({ error: `Username "${username}" is already taken` });
  }
  // New accounts get a temporary password and must choose their own at first sign-in.
  const user = await createUser({ username, fullName, password: String(body.password), role });
  log(req, `created user ${username} (${role})`);
  res.status(201).json(publicUser(user));
});

router.put('/:id', async (req, res) => {
  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const body = req.body || {};
  const patch = {};
  if (body.fullName !== undefined) {
    const fullName = String(body.fullName).trim();
    if (!fullName || fullName.length > 128) return res.status(400).json({ error: 'Enter a full name' });
    patch.fullName = fullName;
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return res.status(400).json({ error: 'Invalid role' });
    patch.role = body.role;
  }
  if (body.active !== undefined) patch.active = Boolean(body.active);

  const isSelf = target.id === req.user.id;
  if (isSelf && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
    return res.status(400).json({ error: 'You cannot disable your own account or remove your own admin role' });
  }
  const losesAdmin =
    target.role === 'admin' && target.active && (patch.active === false || (patch.role && patch.role !== 'admin'));
  if (losesAdmin && (await countActiveAdmins(target.id)) === 0) {
    return res.status(400).json({ error: 'There must always be at least one active administrator' });
  }
  const updated = await updateUser(target.id, patch);
  forgetCachedUser(target.id);
  log(req, `updated user ${target.username} ${JSON.stringify(patch)}`);
  res.json(publicUser(updated));
});

/** Set a temporary password for someone who forgot theirs. */
router.put('/:id/password', async (req, res) => {
  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'Use "Change my password" for your own account' });
  }
  const problem = validatePassword(req.body?.newPassword);
  if (problem) return res.status(400).json({ error: problem });
  const updated = await setPassword(target.id, String(req.body.newPassword), { mustChange: true });
  forgetCachedUser(target.id);
  log(req, `reset password for ${target.username}`);
  res.json(publicUser(updated));
});

router.delete('/:id', async (req, res) => {
  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (target.role === 'admin' && target.active && (await countActiveAdmins(target.id)) === 0) {
    return res.status(400).json({ error: 'There must always be at least one active administrator' });
  }
  await deleteUser(target.id);
  forgetCachedUser(target.id);
  log(req, `deleted user ${target.username}`);
  res.json({ ok: true });
});

export default router;
