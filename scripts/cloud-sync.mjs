/**
 * Clinic laptop ↔ HeatWave sync from the command line.
 *
 *   node scripts/cloud-sync.mjs push            laptop → cloud (end of the day)
 *   node scripts/cloud-sync.mjs push --force    …even if the cloud was changed online
 *   node scripts/cloud-sync.mjs pull            cloud → laptop (first-time laptop setup)
 *   node scripts/cloud-sync.mjs pull --force    …replacing data already on the laptop
 *   node scripts/cloud-sync.mjs status          what changed on the laptop since the last sync
 *
 * Uses MYSQL_* (laptop database) and CLOUD_MYSQL_* (HeatWave) from .env.
 */
const [command = 'status', ...flags] = process.argv.slice(2);
const force = flags.includes('--force');

const { pushToCloud, pullFromCloud, localChangesSinceSync, readSyncState, SyncConflictError } =
  await import('../server/src/cloudSync.js');

function printSummary(result) {
  for (const [table, s] of Object.entries(result.tables || {})) {
    if (s.written || s.deleted) {
      console.log(`  ${table}: ${s.written} added/updated, ${s.deleted} removed`);
    }
  }
  const f = result.files || {};
  if (f.uploaded || f.deleted) console.log(`  photos: ${f.uploaded} uploaded, ${f.deleted} removed`);
  if (f.downloaded) console.log(`  photos: ${f.downloaded} downloaded`);
  if (f.missingOnDisk?.length) {
    console.log(`  WARNING: ${f.missingOnDisk.length} photo file(s) missing on this laptop were not uploaded:`);
    for (const p of f.missingOnDisk) console.log(`    ${p}`);
  }
  if (f.notInCloud?.length) {
    console.log(`  WARNING: ${f.notInCloud.length} photo file(s) were not found in the cloud.`);
  }
}

try {
  if (command === 'push') {
    console.log('Syncing this laptop to the cloud database…');
    const result = await pushToCloud({ force });
    console.log(`Done. The cloud now matches this laptop (${result.finishedAt}).`);
    printSummary(result);
  } else if (command === 'pull') {
    console.log('Copying the cloud database to this laptop…');
    const result = await pullFromCloud({ force });
    console.log(`Done. This laptop now has the cloud data (${result.finishedAt}).`);
    printSummary(result);
  } else if (command === 'status') {
    const state = readSyncState();
    const changes = await localChangesSinceSync();
    console.log(`Last sync to cloud:   ${state.lastPushAt || 'never'}`);
    console.log(`Last copy from cloud: ${state.lastPullAt || 'never'}`);
    if (changes.neverSynced) console.log('This laptop has never synced.');
    else if (changes.changedTables.length) {
      console.log(`Not yet synced: changes in ${changes.changedTables.join(', ')}`);
    } else console.log('Everything is synced.');
  } else {
    console.error(`Unknown command "${command}". Use push, pull or status.`);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`\nSync failed: ${err.message}`);
  if (err instanceof SyncConflictError) {
    console.error(
      command === 'push'
        ? 'If you are sure the laptop has the correct data, run:  node scripts/cloud-sync.mjs push --force'
        : 'To replace the laptop data with the cloud data, run:  node scripts/cloud-sync.mjs pull --force'
    );
  }
  process.exitCode = 1;
}
// The app's database pool (opened when the module loads) would keep Node running.
process.exit();
