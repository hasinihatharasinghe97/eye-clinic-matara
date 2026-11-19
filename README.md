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
3. Open **http://localhost:5173** and sign in as `admin` (first time: the password from
   `.env` `CLINIC_PASSWORD`). Then add each person under **Users**.

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

## User accounts

- Everyone signs in with their **own username and password**. Accounts live in the MySQL
  table `app_users`; passwords are stored only as scrypt hashes — never in a file.
- **First start:** an `admin` account is created automatically using the old clinic
  password (or `CLINIC_PASSWORD` on a fresh install; if neither exists, the default
  `clinic123`, which must be changed at first sign-in). The old password is then removed
  from `settings.json`.
- **Users** page (administrators): add people, choose Staff or Administrator, reset a
  forgotten password (they must pick a new one at next sign-in), disable or delete accounts.
  There is always at least one active administrator.
- **My account** (everyone): change your own password (needs the current one, 8+ characters).
  Changing, resetting or disabling signs that person out on every device.
- The laptop and the online (Render) app each have their own user list — cloud sync copies
  patient data only, not accounts.
- Do not share passwords, or one account between people.

## Security

- **Sessions:** signing in sets an `ec_session` cookie that is HttpOnly (page scripts
  cannot read it), SameSite=Strict, and Secure on HTTPS. It carries a signed, per-user token
  (12 hours). It is never put in localStorage or in URLs; images and downloads use the cookie.
  Every API except sign-in, sign-out, health and the backup cron requires it.
- **Cross-site requests:** every change (POST/PUT/PATCH/DELETE) must also carry the header
  `X-Requested-With: eye-clinic`, which other websites cannot send. Scripts and tools
  calling the API must add it too (they can authenticate with `Authorization: Bearer`).
- **Login protection:** after 5 wrong passwords a device is locked out for 1 minute,
  doubling each time (up to 1 hour). Failed logins are written to the server log.
- **Uploads:** only real JPEG, PNG, WebP, GIF and PDF files are accepted (checked by
  their content, not the file name), and they are served so they can never run as a page.
- **Browser protections:** strict Content-Security-Policy, no caching of patient data,
  no referrer leaks, clickjacking protection, HTTPS-only (HSTS) on Render.
- **Other websites** cannot call the API. To allow one, set `CORS_ORIGINS` (comma-separated).
- Set a long random `AUTH_SECRET` on Render (render.yaml generates one) and on the laptop.
- Behind a reverse proxy other than Render, set `TRUST_PROXY=1` so lockouts use the real IP.
- **Auto sign-out:** after 8 hours with no activity the app warns for 60 seconds, then
  signs out. Signing out in one browser tab signs out all tabs.
- **Encrypted backups:** set `BACKUP_PASSWORD` (12+ characters) in `.env` and on Render.
  Backups are then AES-256 encrypted and saved as `.zip.enc` (local, HeatWave and Google
  Drive). **Keep a copy of this password somewhere safe, away from the clinic computer —
  without it the backups cannot be opened.**
  - Open one: `node scripts/decrypt-backup.mjs EyeClinic-Backup-….zip.enc`
  - Restore one: `node scripts/restore-from-backup.mjs EyeClinic-Backup-….zip.enc`
  - Both read `BACKUP_PASSWORD` from `.env`, or ask for it.

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
