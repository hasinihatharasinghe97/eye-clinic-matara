# Nethraloka Ayurvedic Eye Clinic — Patient System

Patient records, visit history, improvement tracking, and report image uploads for the eye clinic.

Works on the clinic PC and on the internet (**phone + browser**) via **Oracle HeatWave + Render**.

## Requirements

- [Node.js 22+](https://nodejs.org/) (Node 24 recommended)
- [MySQL 8+](https://dev.mysql.com/downloads/mysql/) (local or HeatWave)
- A modern browser (Chrome / Edge / Safari)

## Quick start (Windows PC)

### Option A — local MySQL with Docker (easiest for testing)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Double-click **`start-local-db.bat`** (creates `.env.local` + starts MySQL).
3. Double-click **`start-clinic.bat`**.
4. Open **http://localhost:5173** (password from `.env.local`, default `clinic123`).

`.env.local` overrides cloud HeatWave settings in `.env`, so local testing stays separate.

Or from a terminal:

```bat
copy .env.local.example .env.local
npm run db:local:up
npm run install:all
npm run dev
```

### Option B — MySQL installed on the PC

1. Install MySQL and create a database (or let the app create `eye_clinic` on first start).
2. Copy `.env.local.example` → `.env.local` and set local MySQL values (or use PowerShell):

```powershell
$env:MYSQL_HOST="127.0.0.1"
$env:MYSQL_USER="root"
$env:MYSQL_PASSWORD="root"
$env:MYSQL_DATABASE="eye_clinic"
```

3. Open the `eye-clinic` folder.
4. Double-click **`start-clinic.bat`** (first run installs dependencies).
5. Open **http://localhost:5173**
6. Sign in (set or change the password under **Backup & Settings**).

Or from a terminal:

```bat
cd eye-clinic
npm run install:all
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001  

Export local data for cloud import:

```bat
npm run export:snapshot
```

## Move to another PC (doctor laptop)

1. Install [Node.js 22+](https://nodejs.org/) on the new PC.
2. Copy the whole `eye-clinic` folder (include the `data` folder so patients and uploads come along).
3. Optional but safer: delete `node_modules`, `server\node_modules`, and `client\node_modules` on the new PC, then double-click **`start-clinic.bat`**.
4. Open **http://localhost:5173** and sign in.

## Cloud hosting (HeatWave + Render)

| Guide | Link |
|--------|------|
| Full steps | **[docs/HOSTING.md](docs/HOSTING.md)** |
| Checklist | [docs/DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md) |

```powershell
npm run export:snapshot
# MYSQL_* in .env already point at HeatWave NLB, then:
npm run import:heatwave
# or a backup ZIP:
node scripts/restore-from-backup.mjs .\EyeClinic-Backup-....zip
```

Backups: **Backup & Settings** → Backup now → Download → Google Drive / USB weekly.

## What you can do

| Feature | Description |
|--------|-------------|
| Patients | Register, search (name / OPD / phone / ID), edit demographics |
| Visits | Screening form (vision, inspection, slit lamp, IOP, cataract fields) |
| Progress | Date + R/L notes timeline for improvement tracking |
| Images | Upload report photos or PDFs per patient |
| Backup | One-click ZIP + automatic backup when stale (cloud) |

## Where data is stored

**On the PC**

```
MySQL database (eye_clinic by default)
data/
  uploads/         ← report images (local mode)
  settings.json    ← password, backup folder, last backup time
  backups/         ← default ZIP backup location
```

**In the cloud** (HeatWave + Render)

- Database: Oracle HeatWave MySQL (~50 GB)
- Uploaded files + ZIP backups: inside MySQL (`STORE_FILES_IN_DB=1`)
- ZIP backups are downloadable from Backup & Settings

## Backup plan (important)

**Cloud (Oracle HeatWave + Render)**

1. Live data and uploaded files are in **HeatWave MySQL** (`STORE_FILES_IN_DB=1`).
2. **Backup now** (or auto ~every 20h) writes a ZIP into HeatWave (`backup_archives`, last 7 kept).
3. **Google Drive (recommended):** nightly at 1:00 am Asia/Colombo uploads `Nethraloka-Daily-….zip` and deletes yesterday’s Drive file after success (see Backup & Settings + `docs/HOSTING.md`).
4. Still keep an occasional USB download.
5. Restore into HeatWave with `STORE_FILES_IN_DB=1` and `node scripts/restore-from-backup.mjs <zip>`.

**Local PC**

1. Open **Backup & Settings**.
2. Click **Backup now**, then **Download**.
3. Keep a copy on Google Drive / OneDrive / USB.
4. Restore: `node scripts/restore-from-backup.mjs <zip>`

## Login password

- Set `CLINIC_PASSWORD` on Render (and optionally in local `.env`).
- Change it anytime under **Backup & Settings**.
- Do not share the password in screenshots or public docs.

## Project layout

```
eye-clinic/
  client/     React (Vite) UI — mobile responsive
  server/     Express API + MySQL
  data/       Local uploads and settings (not committed to git)
  scripts/    Snapshot export / import / restore helpers
  docs/       Hosting guide + MySQL schema
  start-clinic.bat
```
