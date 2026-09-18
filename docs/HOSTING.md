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

### Google Drive setup

1. Google Cloud Console → create/select project → enable **Google Drive API**
2. Create a **Service account** → Keys → Add JSON key → download the file
3. Google Drive → create folder `Nethraloka-Backups` → Share with the service account email as **Editor**
4. Copy the folder ID from the URL (`…/folders/FOLDER_ID`)
5. On Render → Environment, set:

| Variable | Value |
|----------|--------|
| `GOOGLE_DRIVE_FOLDER_ID` | folder ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | full JSON key (one line) — or use `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` |
| `BACKUP_CRON_SECRET` | long random string |

6. **Free Render sleep:** the app also catch-ups on wake after 1:00 am. For a reliable 1:00 am run, add an external cron (e.g. cron-job.org) daily at 01:00 Asia/Colombo:

```http
POST https://YOUR-APP.onrender.com/api/system/cron/drive-backup
X-Cron-Secret: your-BACKUP_CRON_SECRET
```

7. In the app: **Backup & Settings** → confirm Drive shows Enabled → **Upload to Google Drive now** once to test.

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
