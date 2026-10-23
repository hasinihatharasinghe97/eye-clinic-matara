# Nethraloka Ayurvedic Eye Clinic — Patient System

Patient records, visit history, improvement tracking, and report image uploads for the eye clinic.

Works on the clinic PC and on the internet (**phone + browser**) via **Oracle HeatWave + Render**. Local and cloud both use the **same HeatWave database**.

## Requirements

- [Node.js 22+](https://nodejs.org/) (Node 24 recommended)
- A modern browser (Chrome / Edge / Safari)
- Network access to Oracle HeatWave (via NLB) — credentials in `.env`

## Quick start (Windows PC)

1. Ensure `.env` has HeatWave `MYSQL_*` values (copy from `.env.example` if needed).
2. Open the `eye-clinic` folder.
3. Double-click **`start-clinic.bat`** (first run installs dependencies).
4. Open **http://localhost:5173**
5. Sign in (password from `.env` `CLINIC_PASSWORD`, or change under **Backup & Settings**).

Or from a terminal:

```bat
cd eye-clinic
npm run install:all
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001  

## Move to another PC (doctor laptop)

1. Install [Node.js 22+](https://nodejs.org/) on the new PC.
2. Copy the whole `eye-clinic` folder (include `.env` so HeatWave credentials come along).
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

**HeatWave MySQL** (used by local app and Render)

- Database: Oracle HeatWave MySQL (~50 GB)
- Uploaded files + ZIP backups: inside MySQL (`STORE_FILES_IN_DB=1`)
- ZIP backups are downloadable from Backup & Settings

Local disk still keeps:

```
data/
  settings.json    ← password override, backup folder preference
  backups/         ← optional local ZIP downloads
```

## Backup plan (important)

1. Live data and uploaded files are in **HeatWave MySQL** (`STORE_FILES_IN_DB=1`).
2. **Backup now** (or auto ~every 20h on Render) writes a ZIP into HeatWave (`backup_archives`, last 7 kept).
3. **Google Drive (recommended):** nightly at 1:00 am Asia/Colombo uploads `Nethraloka-Daily-….zip` and deletes yesterday’s Drive file after success (see Backup & Settings + `docs/HOSTING.md`).
4. Still keep an occasional USB download.
5. Restore into HeatWave with `STORE_FILES_IN_DB=1` and `node scripts/restore-from-backup.mjs <zip>`.

## Login password

- Set `CLINIC_PASSWORD` on Render (and in local `.env`).
- Change it anytime under **Backup & Settings**.
- Do not share the password in screenshots or public docs.

## Project layout

```
eye-clinic/
  client/     React (Vite) UI — mobile responsive
  server/     Express API + MySQL
  data/       Local settings (not committed to git)
  scripts/    Snapshot export / import / restore helpers
  docs/       Hosting guide + MySQL schema
  start-clinic.bat
```
