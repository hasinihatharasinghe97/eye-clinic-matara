# Free cloud hosting — Eye Clinic Matara

This app can stay on the clinic PC **or** run free on the internet so the doctor can use phone + browser.

## Recommended free stack

| Piece | Service | Cost |
|--------|---------|------|
| App (web + API) | [Render](https://render.com) free Web Service | Free (sleeps after ~15 min idle; wakes on visit) |
| Database | [Turso](https://turso.tech) free libSQL/SQLite | Free (5 GB) |
| Daily backups | Built into the app (keeps last 14 ZIPs) | Free |

For ~800 patients this fits comfortably on free tiers.

---

## Step 1 — Create a free Turso database

1. Sign up at https://turso.tech (GitHub login is fine).
2. Create a database, e.g. `eye-clinic-matara`.
3. Copy:
   - **Database URL** → `TURSO_DATABASE_URL` (looks like `libsql://….turso.io`)
   - **Auth token** → `TURSO_AUTH_TOKEN`

Optional: upload existing PC data after deploy (see “Migrate data” below).

---

## Step 2 — Deploy the app on Render (free)

1. Push this project to a free GitHub repository.
2. Go to https://dashboard.render.com → **New** → **Blueprint**.
3. Connect the GitHub repo (uses `render.yaml`).
4. In the service **Environment** tab, set:

| Variable | Value |
|----------|--------|
| `TURSO_DATABASE_URL` | from Turso |
| `TURSO_AUTH_TOKEN` | from Turso |
| `CLINIC_PASSWORD` | strong clinic password (change from `clinic123`) |

5. Deploy. Render gives a URL such as `https://eye-clinic-xxxx.onrender.com`.

Open that URL on a phone or PC browser and sign in.

First load after idle may take 30–60 seconds (free tier cold start). After that it is normal.

---

## Step 3 — Daily backups

The server **automatically creates a ZIP backup every evening** (keeps the last **14**).

From **Backup & Settings** you can:

- Click **Backup now**
- **Download** any saved ZIP to the phone/PC
- Copy that ZIP into Google Drive / OneDrive (recommended weekly)

Also download a copy before any big change.

Turso free plan also keeps a short point-in-time window; the app ZIP backups are the main recovery path.

---

## Step 4 — Use on mobile

1. Open the Render URL in Chrome / Safari.
2. Optional: **Add to Home Screen** for an app-like icon.
3. Sign in with the clinic password.

The UI is responsive (single-column forms and scrollable tables on small screens).

---

## Migrate data from the clinic PC to Turso

On the PC (with local data already working):

```bat
cd eye-clinic
set TURSO_DATABASE_URL=libsql://YOUR-db.turso.io
set TURSO_AUTH_TOKEN=YOUR_TOKEN
node scripts/migrate-to-turso.mjs
```

This copies patients, visits, progress, attachments, and uploaded files into Turso.

---

## Keep using only the PC (no cloud)

You can still double-click `start-clinic.bat` and use `http://localhost:5173` as before. Cloud variables are optional.

---

## Security notes

- Change the clinic password after the first cloud deploy.
- Do not share the Render URL publicly; treat it like clinic records.
- Prefer hospital Wi‑Fi or mobile data you trust when entering patient data.
- Keep at least one backup ZIP outside Turso (Google Drive / USB).
