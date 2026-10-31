# Nethraloka Ayurvedic Eye Clinic — Patient System

Patient records, eye screening visits, improvement charts, reports and report image uploads for
the eye clinic.

Runs in two places that share the same records:

- **Online** — hosted on **Render** with the **Oracle HeatWave** MySQL database (phone + browser).
- **Doctor's laptop** — works with **no internet** at the clinic, using its own MySQL database,
  and syncs both ways with HeatWave automatically whenever it is online.
  See **[docs/OFFLINE-LAPTOP.md](docs/OFFLINE-LAPTOP.md)**.

## Requirements

- [Node.js 22+](https://nodejs.org/) (Node 24 recommended)
- A modern browser (Chrome / Edge / Firefox / Safari)
- Laptop: MySQL 8+ installed locally (see the offline guide)

## Quick start (Windows)

1. Copy `.env.laptop.example` (offline laptop) or `.env.example` (PC using HeatWave directly) to
   `.env` and fill it in.
2. Double-click **`start-clinic.bat`** (first run installs dependencies).
3. Open **http://localhost:5173** and sign in (password from `.env` `CLINIC_PASSWORD`, or change
   it under **Backup & Settings**).

Or from a terminal:

```bat
npm run install:all
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

## Guides

| Topic | Guide |
|--------|------|
| Online hosting (HeatWave + Render) | [docs/HOSTING.md](docs/HOSTING.md) |
| Offline laptop + two-way sync | [docs/OFFLINE-LAPTOP.md](docs/OFFLINE-LAPTOP.md) |

## What you can do

| Feature | Description |
|--------|-------------|
| Patients | Register, search (name / OPD / phone / ID), edit details, full profile PDF |
| Screening forms | Vision (distance, near, pinhole), visual field, colour vision, contrast, glare / halo, Amsler grid, inspection, slit lamp, IOP, cataract |
| All visits by section | Every screening form of a patient in one table |
| Charts | Vision, pinhole, near vision, contrast, colour vision, IOP and progress trends |
| Reports | Daily attendance and monthly report (age groups, districts) as PDF |
| Stats | Clinic statistics, including patients by diagnosis |
| Medicines | Mark medicine PDFs (1–500) sent on WhatsApp |
| Images | Upload report photos or PDFs per patient |
| Backup | One-click ZIP, nightly Google Drive copy (online) |

## Where data is stored

- **Online:** HeatWave MySQL; uploaded files and ZIP backups are stored inside MySQL
  (`STORE_FILES_IN_DB=1`).
- **Laptop:** its own MySQL; uploads and ZIP backups in `data/` on disk. Synced with HeatWave
  (see the offline guide).

## Backups

1. **Google Drive (recommended, online):** nightly at 1:00 am Asia/Colombo uploads
   `Nethraloka-Daily-….zip` and deletes yesterday's Drive file after success.
2. **Backup now** in Backup & Settings creates a ZIP you can download (keep a USB copy now and then).
3. Restore into an empty database with `npm run restore:backup -- <zip>`
   (`STORE_FILES_IN_DB=1` for HeatWave).

## Login password

- Set `CLINIC_PASSWORD` on Render and in the local `.env`.
- Change it anytime under **Backup & Settings**.
- Do not share the password in screenshots or public docs.

## Project layout

```
eye-clinic/
  client/     React (Vite) UI — mobile responsive
  server/     Express API + MySQL, laptop ↔ cloud sync
  scripts/    Backup restore and cloud-sync commands
  docs/       Hosting and offline-laptop guides
  data/       Local settings, uploads and backups (not committed to git)
  start-clinic.bat   start the clinic app (every day)
  clinic-tools.bat   menu: sync now, sync status, background sync on/off, first-time copy
```
