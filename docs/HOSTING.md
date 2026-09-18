# Cloud hosting — HeatWave (50 GB) + Render

**App:** [Render](https://render.com) free Web Service  
**Database:** Oracle MySQL HeatWave Always Free (~50 GiB) via Network Load Balancer  
**Files:** stored in MySQL (`STORE_FILES_IN_DB=1`)

Checklist: [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md)

---

## 1. Oracle HeatWave MySQL

1. OCI Console → **Databases** → **HeatWave MySQL** → **Create DB system**
2. Template: **Always Free** (`MySQL.Free`, 50 GiB)
3. Admin user + strong password (save them)
4. Place the DB on a **private subnet** in your VCN
5. Wait until status is **Active**
6. Note the **private IP** and port **3306**

Create the app database (DBeaver / MySQL client via NLB after step 2):

```sql
CREATE DATABASE IF NOT EXISTS eye_clinic
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 2. Network Load Balancer (public MySQL endpoint)

HeatWave has no public IP. Expose it with an NLB:

1. **Networking** → **Network Load Balancer** → **Create** (Public)
2. Same VCN; subnet = **public** subnet
3. Listener: **TCP 3306**, idle timeout **120**
4. Backend set: health check **TCP 3306**, **Preserve source IP = OFF**
5. Add backend: HeatWave **private IP**, port **3306**
6. Security lists / NSG: allow **TCP 3306** to the NLB and from the NLB to the private subnet
7. Copy the NLB **public IP** → this is `MYSQL_HOST`

---

## 3. Render Web Service

Repo: https://github.com/hasinihatharasinghe97/eye-clinic-matara  

**Use Node runtime, not Docker.**

| Field | Value |
|--------|--------|
| Build | `npm run build:render` |
| Start | `node server/src/index.js` |
| Plan | Free |

Environment variables:

| Variable | Value |
|----------|--------|
| `MYSQL_HOST` | NLB public IP |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | HeatWave admin user |
| `MYSQL_PASSWORD` | HeatWave password |
| `MYSQL_DATABASE` | `eye_clinic` |
| `MYSQL_SSL` | `1` |
| `STORE_FILES_IN_DB` | `1` |
| `CLINIC_PASSWORD` | clinic login password |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |

Cold start after idle: ~30–60s. Open `/api/health` — `ok: true` means MySQL is reachable.

---

## 4. Import clinic PC data

```powershell
cd D:\eye-clinic
npm run export:snapshot

# Point MYSQL_* at HeatWave (via NLB) — use .env or env vars:
$env:MYSQL_SSL="1"
$env:STORE_FILES_IN_DB="1"
npm run import:heatwave
# or:
node scripts/restore-from-backup.mjs .\EyeClinic-Backup-....zip
```

---

## Backup system

Every ZIP contains `snapshot.json`, `uploads/`, and restore notes.

- **Google Drive daily (recommended):** at **01:00 Asia/Colombo**, upload `Nethraloka-Daily-YYYY-MM-DD.zip` to Drive only (not duplicated into HeatWave); when today’s upload succeeds, **delete yesterday’s** Drive file
- **Manual HeatWave ZIPs:** Backup now still stores optional ZIPs in MySQL `backup_archives` for in-app download (keeps last **7**)
- **Restore to a new HeatWave:** point `MYSQL_*` at the new instance + `STORE_FILES_IN_DB=1`, then `node scripts/restore-from-backup.mjs <zip>`

### Google Drive setup (step by step)

Goal: every night at **1:00 am Sri Lanka time**, Render builds a clinic ZIP and uploads it to **your** Google Drive. Yesterday’s Drive ZIP is deleted after today’s upload succeeds.

---

#### Part A — Google Cloud (service account)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in with the Google account that owns the Drive.
2. Top bar → **Select a project** → **New Project**
   - Name: e.g. `nethraloka-backups`
   - Click **Create** and wait until it is selected
3. Left menu → **APIs & Services** → **Library**
4. Search **Google Drive API** → open it → **Enable**
5. Left menu → **APIs & Services** → **Credentials**
6. **+ Create credentials** → **Service account**
   - Service account name: e.g. `nethraloka-backup`
   - Click **Create and continue**
   - Role: you can skip (or choose *Basic → Editor* if asked) → **Done**
7. Open the new service account → tab **Keys** → **Add key** → **Create new key** → **JSON** → **Create**
8. A `.json` file downloads to your PC. **Keep it private** (never commit to git / never email publicly).
9. On the service account details page, copy the email that looks like:  
   `nethraloka-backup@nethraloka-backups.iam.gserviceaccount.com`  
   You need this for Part B.

---

#### Part B — Google Drive folder

1. Open [Google Drive](https://drive.google.com/) (same Google account)
2. **New** → **New folder** → name it `Nethraloka-Backups` → Create
3. Open that folder
4. Look at the browser address bar. It looks like:  
   `https://drive.google.com/drive/folders/1AbCDefGhijKLMNOpqrsTUvwxYZ12345`  
   The long string after `/folders/` is your **folder ID**. Copy it.
5. Click **Share** on the folder
6. Paste the **service account email** from Part A
7. Permission: **Editor**
8. Uncheck “Notify people” if shown → **Share** / **Send**

The robot account can now write ZIPs into that folder.

---

#### Part C — Render environment variables

1. Open [Render Dashboard](https://dashboard.render.com/) → your **eye-clinic** Web Service
2. Left: **Environment**
3. Add these variables (Save after each, or add all then save):

| Key | What to put |
|-----|-------------|
| `GOOGLE_DRIVE_FOLDER_ID` | Folder ID from Part B (only the ID, not the full URL) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Entire contents of the downloaded JSON file as **one line** |
| `BACKUP_CRON_SECRET` | Any long random password you invent, e.g. `NethraDrive2026!xK9` |

**How to paste the JSON on Windows (PowerShell):**

```powershell
# Opens the key file and copies a single-line JSON to the clipboard
Get-Content -Raw .\path\to\your-service-account.json | ConvertFrom-Json | ConvertTo-Json -Compress | Set-Clipboard
```

Then paste into Render’s `GOOGLE_SERVICE_ACCOUNT_JSON` value box.

If Render rejects the JSON (quotes/newlines), use Base64 instead:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\path\to\your-service-account.json")) | Set-Clipboard
```

Set on Render:

| Key | Value |
|-----|--------|
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | paste from clipboard |
| *(leave `GOOGLE_SERVICE_ACCOUNT_JSON` empty)* | |

4. **Manual Deploy** → **Deploy latest commit** (or restart the service) so new env vars load.

---

#### Part D — Test once in the app

1. Open your clinic site → sign in
2. Go to **Backup & Settings**
3. Under **Google Drive daily offsite copy** it should say **Enabled**
4. Click **Upload to Google Drive now**
5. Open the Drive folder `Nethraloka-Backups` — you should see a file like:  
   `Nethraloka-Daily-2026-09-18.zip`

If it fails, the page shows **Last error**. Common fixes:
- Folder not shared with the service account as Editor
- Wrong folder ID
- Drive API not enabled
- JSON env var truncated / invalid

---

#### Part E — Reliable 1:00 am on free Render (cron-job.org)

Free Render **sleeps** when idle, so 1:00 am may be missed unless something wakes the app.

1. Open [cron-job.org](https://cron-job.org/) → create a free account
2. **Create cronjob**
3. Settings:
   - **Title:** `Nethraloka Drive backup`
   - **URL:** `https://YOUR-APP.onrender.com/api/system/cron/drive-backup`  
     (replace with your real Render URL)
   - **Schedule:** every day at **01:00**
   - **Timezone:** **Asia/Colombo** (Sri Lanka)
   - **Request method:** **POST**
   - **Headers:** add  
     - Name: `X-Cron-Secret`  
     - Value: the same string as `BACKUP_CRON_SECRET` on Render
4. Save / enable the job

That wakes Render and runs the Drive upload even if the site was sleeping.

---

#### What success looks like

- Drive folder always has **one** latest file: `Nethraloka-Daily-YYYY-MM-DD.zip`
- After a new day’s upload, the previous day’s Drive file is removed
- Backup & Settings shows **Last Drive upload** with a recent time

```powershell
$env:STORE_FILES_IN_DB="1"
node scripts/restore-from-backup.mjs .\EyeClinic-Backup-....zip
# or the daily Drive file:
node scripts/restore-from-backup.mjs .\Nethraloka-Daily-2026-09-18.zip
```

---

## Security

- Strong `MYSQL_PASSWORD` and `CLINIC_PASSWORD`
- Prefer locking NLB ingress to known IPs when possible (Render egress can change on free tier)
- Never commit `.env` or the Google service-account JSON
- Treat the public clinic URL as confidential
