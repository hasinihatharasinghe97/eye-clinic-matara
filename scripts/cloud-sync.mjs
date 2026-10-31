/**
 * Clinic laptop ↔ HeatWave sync from the command line.
 *
 *   node scripts/cloud-sync.mjs sync             two-way sync now (laptop ↔ cloud)
 *   node scripts/cloud-sync.mjs sync --force     …even if it would delete many rows on one side
 *   node scripts/cloud-sync.mjs auto             sync only if something changed and the connection
 *                                                is stable (used by the background scheduled task)
 *   node scripts/cloud-sync.mjs status           last sync, and laptop changes not yet synced
 *   node scripts/cloud-sync.mjs pull             first-time laptop setup: copy the cloud onto the laptop
 *   node scripts/cloud-sync.mjs pull --force     recovery: replace ALL laptop data with the cloud's
 *   node scripts/cloud-sync.mjs overwrite-cloud  recovery: replace ALL cloud data with the laptop's
 *
 * Uses MYSQL_* (laptop database) and CLOUD_MYSQL_* (HeatWave) from .env.
 */
const [command = 'status', ...flags] = process.argv.slice(2);
const force = flags.includes('--force');

const {
  syncBoth,
  pullFromCloud,
  overwriteCloud,
  autoSyncOnce,
  localChangesSinceSync,
  readSyncState,
  SyncSafetyError,
} = await import('../server/src/cloudSync.js');

function printSummary(result) {
  for (const [table, s] of Object.entries(result.tables || {})) {
    const parts = [];
    if (s.toCloud) parts.push(`${s.toCloud} sent to cloud`);
    if (s.toLaptop) parts.push(`${s.toLaptop} received`);
    if (s.deletedCloud) parts.push(`${s.deletedCloud} deleted in cloud`);
    if (s.deletedLaptop) parts.push(`${s.deletedLaptop} deleted on laptop`);
    if (s.written) parts.push(`${s.written} copied`);
    if (s.deleted) parts.push(`${s.deleted} removed`);
    if (parts.length) console.log(`  ${table}: ${parts.join(', ')}`);
  }
  for (const c of result.conflicts || []) {
    console.log(`  ${c.table} ${c.key}: ${c.reason} (kept the ${c.kept} version)`);
  }
  if (result.skipped) console.log(`  ${result.skipped} row(s) were being edited and will sync next time`);
  const f = result.files || {};
  if (f.uploaded) console.log(`  photos: ${f.uploaded} uploaded`);
  if (f.downloaded) console.log(`  photos: ${f.downloaded} downloaded`);
  if (f.missingOnDisk?.length) {
    console.log(`  WARNING: ${f.missingOnDisk.length} photo file(s) missing on this laptop could not be uploaded`);
  }
  if (f.notInCloud?.length) console.log(`  WARNING: ${f.notInCloud.length} photo file(s) were not found in the cloud`);
}

try {
  if (command === 'sync' || command === 'push') {
    console.log('Syncing this laptop and the cloud database (both ways)…');
    const result = await syncBoth({ force });
    console.log(`Done. The laptop and the cloud now match (${result.finishedAt}).`);
    printSummary(result);
  } else if (command === 'pull') {
    console.log('Copying the cloud database to this laptop…');
    const result = await pullFromCloud({ force });
    console.log(`Done. This laptop now has the cloud data (${result.finishedAt}).`);
    printSummary(result);
  } else if (command === 'overwrite-cloud') {
    console.log('Replacing the cloud data with this laptop’s data…');
    const result = await overwriteCloud({ force });
    console.log(`Done. The cloud is now an exact copy of this laptop (${result.finishedAt}).`);
    printSummary(result);
  } else if (command === 'auto') {
    const r = await autoSyncOnce();
    console.log(`Automatic sync: ${r.outcome}${r.message ? ` - ${r.message}` : ''}`);
    if (r.outcome === 'failed') process.exitCode = 1;
  } else if (command === 'status') {
    const state = readSyncState();
    const changes = await localChangesSinceSync();
    console.log(`Last sync: ${state.lastSyncAt || 'never'}`);
    if (state.auto?.lastCheckAt) {
      console.log(`Last automatic check: ${state.auto.lastCheckAt} (${state.auto.outcome})`);
    }
    if (state.autoBlocked) console.log(`Automatic sync is PAUSED: ${state.autoBlocked}`);
    if (changes.neverSynced) console.log('This laptop has not been set up yet (run: pull).');
    else if (changes.changedTables.length) {
      console.log(`Laptop changes not yet synced: ${changes.changedTables.join(', ')}`);
    } else console.log('No laptop changes waiting.');
  } else {
    console.error(`Unknown command "${command}". Use sync, auto, status, pull or overwrite-cloud.`);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`\nSync failed: ${err.message}`);
  if (err instanceof SyncSafetyError) {
    if (command === 'pull') {
      console.error('To replace the laptop data with the cloud data, run:  node scripts/cloud-sync.mjs pull --force');
    } else if (!/same number/.test(err.message)) {
      console.error(`If you are sure, run:  node scripts/cloud-sync.mjs ${command} --force`);
    }
  }
  process.exitCode = 1;
}
// The app's database pool (opened when the module loads) would keep Node running.
process.exit();
