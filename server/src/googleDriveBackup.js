import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { getSettings, saveSettings } from './db.js';

const DRIVE_FILE_PREFIX = 'Nethraloka-Daily-';
const COLOMBO_TZ = 'Asia/Colombo';

function parseServiceAccountJson() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  let text = '';
  if (raw && String(raw).trim()) {
    text = String(raw).trim();
  } else if (b64 && String(b64).trim()) {
    text = Buffer.from(String(b64).trim(), 'base64').toString('utf8');
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid Google service account JSON: ${err.message}`);
  }
}

export function isGoogleDriveConfigured() {
  try {
    const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
    if (!folderId) return false;
    if (String(process.env.GOOGLE_DRIVE_BACKUP || '1').trim() === '0') return false;
    return Boolean(parseServiceAccountJson());
  } catch {
    return false;
  }
}

export function getColomboClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
  };
}

function dailyFileName(dateKey) {
  return `${DRIVE_FILE_PREFIX}${dateKey}.zip`;
}

async function getDriveClient() {
  const credentials = parseServiceAccountJson();
  if (!credentials) {
    throw new Error('Google Drive is not configured (missing service account JSON)');
  }
  const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  if (!folderId) {
    throw new Error('Google Drive is not configured (missing GOOGLE_DRIVE_FOLDER_ID)');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });
  return { drive, folderId };
}

/**
 * Upload ZIP buffer to Drive. On success, delete the previous daily file
 * (yesterday's upload) so only today's successful ZIP remains.
 */
export async function uploadBackupBufferToDrive(buffer, { dateKey } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Backup ZIP is empty');
  }
  const settings = await getSettings();
  const previousFileId = settings.lastDriveFileId || null;

  const clock = getColomboClock();
  const day = dateKey || clock.dateKey;
  const zipName = dailyFileName(day);
  const { drive, folderId } = await getDriveClient();

  const created = await drive.files.create({
    requestBody: {
      name: zipName,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/zip',
      body: Readable.from(buffer),
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) throw new Error('Google Drive upload returned no file id');

  if (previousFileId && previousFileId !== fileId) {
    try {
      await drive.files.delete({ fileId: previousFileId, supportsAllDrives: true });
      console.log(`[gdrive] Deleted previous Drive backup id=${previousFileId}`);
    } catch (err) {
      console.warn(`[gdrive] Could not delete previous Drive backup:`, err.message || err);
    }
  }

  // Best-effort: remove any other Nethraloka-Daily-* leftovers in the folder.
  try {
    const q = [
      `'${folderId}' in parents`,
      'trashed = false',
      `name contains '${DRIVE_FILE_PREFIX}'`,
    ].join(' and ');
    const listed = await drive.files.list({
      q,
      fields: 'files(id, name)',
      pageSize: 50,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const file of listed.data.files || []) {
      if (!file.id || file.id === fileId) continue;
      try {
        await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
        console.log(`[gdrive] Deleted leftover Drive backup: ${file.name}`);
      } catch {
        /* ignore — drive.file scope may not see files created elsewhere */
      }
    }
  } catch {
    /* listing optional */
  }

  const uploadedAt = new Date().toISOString();
  await saveSettings({
    lastDriveBackupAt: uploadedAt,
    lastDriveBackupDate: day,
    lastDriveFileId: fileId,
    lastDriveFileName: zipName,
    lastDriveError: null,
  });

  return {
    ok: true,
    fileId,
    zipName,
    dateKey: day,
    uploadedAt,
    webViewLink: created.data.webViewLink || null,
  };
}

/** Create a ZIP then upload to Drive only (does not store a duplicate in HeatWave). */
export async function createAndUploadDriveBackup(createBackupFn) {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google Drive backup is not configured');
  }
  // persist:false — offsite Drive is enough; avoid doubling ZIP size inside HeatWave's 50GB.
  const result = await createBackupFn({ persist: false });
  const upload = await uploadBackupBufferToDrive(result.buffer, {
    dateKey: getColomboClock().dateKey,
  });
  return { ...upload, size: result.size, localZipName: result.zipName };
}

export async function driveBackupStatus() {
  const settings = await getSettings();
  const configured = isGoogleDriveConfigured();
  const clock = getColomboClock();
  return {
    configured,
    timezone: COLOMBO_TZ,
    schedule: '01:00',
    todayColombo: clock.dateKey,
    uploadedToday: Boolean(
      settings.lastDriveBackupDate && settings.lastDriveBackupDate === clock.dateKey
    ),
    lastDriveBackupAt: settings.lastDriveBackupAt || null,
    lastDriveBackupDate: settings.lastDriveBackupDate || null,
    lastDriveFileName: settings.lastDriveFileName || null,
    lastDriveError: settings.lastDriveError || null,
  };
}

export async function recordDriveError(err) {
  const message = err instanceof Error ? err.message : String(err || 'Drive upload failed');
  try {
    await saveSettings({ lastDriveError: message.slice(0, 500) });
  } catch {
    /* ignore */
  }
  return message;
}

/**
 * True when we should run the daily Drive upload:
 * - at/after 01:00 Asia/Colombo, and
 * - no successful upload recorded for today's Colombo date.
 */
export function shouldRunDailyDriveUpload(settings, now = new Date()) {
  if (!isGoogleDriveConfigured()) return false;
  const clock = getColomboClock(now);
  if (settings?.lastDriveBackupDate === clock.dateKey) return false;
  // At 1:00 or later (catch-up if Render slept through 1am).
  if (clock.hour > 1) return true;
  if (clock.hour === 1) return true;
  return false;
}
