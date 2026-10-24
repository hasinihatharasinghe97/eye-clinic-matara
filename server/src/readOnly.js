/**
 * READ_ONLY=1 makes this server a view-only copy (the online app, when the clinic
 * laptop is the only place records are changed and syncs to HeatWave each day).
 * Changes made online would be overwritten by the next laptop sync, so they are
 * refused here instead. Login, settings and backups still work.
 */
export function isReadOnly() {
  return ['1', 'true'].includes(String(process.env.READ_ONLY || '').trim().toLowerCase());
}

const DATA_PATHS = ['/api/patients', '/api/disease-forms'];

export function blockWritesWhenReadOnly(req, res, next) {
  if (!isReadOnly() || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const p = req.path.toLowerCase();
  if (!DATA_PATHS.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) return next();
  res.status(403).json({
    error:
      'This online copy is view-only. Records are added and changed on the clinic laptop and appear here after it syncs.',
  });
}
