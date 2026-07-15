# Eye Clinic Patient System — District Ayurvedic Hospital Matara

Patient records, visit history, improvement tracking, and report image uploads for the eye clinic.

Works on the clinic PC and (optionally) for free on the internet so staff can use **phone + browser**.

## Requirements

- [Node.js 22+](https://nodejs.org/) (Node 24 recommended)
- A modern browser (Chrome / Edge / Safari)

## Quick start (Windows PC)

1. Open the `eye-clinic` folder.
2. Double-click **`start-clinic.bat`** (first run installs dependencies).
3. Open **http://localhost:5173**
4. Sign in with password: **`clinic123`** (change it under Backup & Settings).

Or from a terminal:

```bat
cd eye-clinic
npm run install:all
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001  

## Free cloud hosting (phone + web)

No budget hosting is available with:

- **Render** (free app URL)
- **Turso** (free cloud database)
- **Daily ZIP backups** built into the app (last 14 kept + download)

Follow the step-by-step guide: **[docs/HOSTING.md](docs/HOSTING.md)**

After deploy you open one HTTPS link on mobile or desktop — same login password.

## What you can do

| Feature | Description |
|--------|-------------|
| Patients | Register, search (name / OPD / phone / ID), edit demographics |
| Visits | Screening form (vision, inspection, slit lamp, IOP, cataract fields) |
| Progress | Date + R/L notes timeline for improvement tracking |
| Images | Upload report photos or PDFs per patient |
| Backup | One-click ZIP + automatic daily backup (cloud) / folder ZIP (PC) |

## Where data is stored

**On the PC**

```
data/
  patients.db      ← patient and visit records
  uploads/         ← report images
  settings.json    ← password, backup folder, last backup time
  backups/         ← default ZIP backup location
```

**In the cloud** (after following HOSTING.md)

- Database + uploaded files: Turso
- ZIP backups: stored in the DB archive table and downloadable from Backup & Settings

## Backup plan (important)

1. Open **Backup & Settings**.
2. Click **Backup now**, then **Download**.
3. Keep a copy on Google Drive / OneDrive / USB.
4. In cloud mode, the app also auto-backs up each evening.

Restore locally: stop the app, unzip into `data/`, start again.

## Default password

- Initial password: `clinic123`
- Change it on the Backup & Settings page (and set `CLINIC_PASSWORD` on Render).

## Project layout

```
eye-clinic/
  client/     React (Vite) UI — mobile responsive
  server/     Express API + SQLite / Turso
  data/       Local database and uploads (not committed to git)
  scripts/    Backup + Turso migration helpers
  docs/       Hosting guide
  start-clinic.bat
```
