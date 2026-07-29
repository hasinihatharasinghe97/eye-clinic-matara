# Free cloud hosting — Eye Clinic Matara

Run the clinic on the internet (phone + browser) at **no monthly cost**, using:

| Piece | Service | Notes |
|--------|---------|--------|
| App (web + API) | [Render](https://render.com) free Web Service | Sleeps after ~15 min idle; cold start ~30–60s |
| Database | [Aiven free MySQL](https://aiven.io/free-mysql-database) | Always-free, ~1 GB, no credit card |
| Backups | Built into the app (last 14 ZIPs) | Also download to Google Drive weekly |

For ~800 patients this fits if you stay within Aiven’s free disk (~1 GB). Uploads are stored **inside MySQL** on Render (`STORE_FILES_IN_DB=1`).

---

## Step 1 — Create free MySQL on Aiven

1. Sign up at https://aiven.io (no card needed for free tier).
2. Create a service: **MySQL** → plan **Free**.
3. When the service is running, open **Overview / Connection information** and copy:
   - Host → `MYSQL_HOST`
   - Port → `MYSQL_PORT` (often not `3306` on Aiven)
   - User → `MYSQL_USER`
   - Password → `MYSQL_PASSWORD`
   - Database → `MYSQL_DATABASE` (often `defaultdb`)
4. Ensure the service accepts connections from the internet (Render has no fixed IP). On free Aiven this is normally the default public hostname + SSL-capable MySQL port.

The app creates tables automatically on first start. You can also apply [`docs/schema.sql`](schema.sql) manually if you prefer.

---

## Step 2 — Push code to GitHub

This repo should already be on GitHub. After local changes:

```bat
git add -A
git status
git commit -m "Your message"
git push origin main
```

Never commit `.env` (passwords).

---

## Step 3 — Deploy the app on Render (free)

**Important:** Use the **Node** runtime, **not Docker**. Docker on Render often forces a payment card even when “Free” is selected.

1. Go to https://dashboard.render.com → **New** → **Web Service**.
2. Connect the GitHub repo `eye-clinic-matara` (or your fork).
3. Set:

| Field | Value |
|--------|--------|
| Language / Runtime | **Node** |
| Branch | `main` |
| Build Command | `npm ci && npm ci --prefix server && npm ci --prefix client && npm run build --prefix client` |
| Start Command | `node server/src/index.js` |
| Instance Type | **Free** |

4. Add environment variables:

| Variable | Value |
|----------|--------|
| `MYSQL_HOST` | from Aiven |
| `MYSQL_PORT` | from Aiven |
| `MYSQL_USER` | from Aiven |
| `MYSQL_PASSWORD` | from Aiven |
| `MYSQL_DATABASE` | from Aiven (often `defaultdb`) |
| `STORE_FILES_IN_DB` | `1` |
| `CLINIC_PASSWORD` | strong clinic password (not `clinic123`) |
| `NODE_ENV` | `production` |

5. Deploy. Render gives a URL such as `https://eye-clinic-xxxx.onrender.com`.

Open that URL once and wait for the first boot (tables are created). First load after idle may take 30–60 seconds.

If Render asks for a card with Node + Free, cancel and keep using the clinic PC (`start-clinic.bat`).

---

## Step 4 — Copy clinic PC data into the cloud

Your live data is in **local MySQL** (not the old SQLite file). Export a snapshot, then import it into Aiven.

### 4a — Export from the clinic PC

With local MySQL running and `.env` pointing at the **local** database:

```powershell
cd D:\eye-clinic
npm run export:snapshot
```

This writes `data\backups\snapshot.json`.

**Alternative:** In the running local app → **Backup & Settings** → **Backup now** → **Download** the ZIP → unzip and use the `snapshot.json` inside (keep the `uploads\` folder next to it).

### 4b — Import into Aiven (cloud MySQL)

Point `MYSQL_*` at **Aiven**, enable file-in-DB mode, then import:

```powershell
cd D:\eye-clinic

$env:MYSQL_HOST="YOUR_AIVEN_HOST"
$env:MYSQL_PORT="YOUR_AIVEN_PORT"
$env:MYSQL_USER="avnadmin"
$env:MYSQL_PASSWORD="YOUR_AIVEN_PASSWORD"
$env:MYSQL_DATABASE="defaultdb"
$env:STORE_FILES_IN_DB="1"

node scripts/migrate-sqlite-to-mysql.mjs .\data\backups\snapshot.json
```

- Attachment **files** are read from `data\uploads\` (or from an `uploads\` folder beside the snapshot) and stored in MySQL `attachment_files`.
- Patient IDs are remapped; run this against an **empty** cloud DB (or accept duplicate patients if you run it twice).

After import, open the Render URL and confirm patients, one attachment, and Backup & Settings.

### Legacy: old SQLite `data/patients.db`

If you still have SQLite and have **not** moved to local MySQL yet:

```powershell
$env:MYSQL_HOST="..."   # destination (local or Aiven)
$env:MYSQL_USER="..."
$env:MYSQL_PASSWORD="..."
$env:MYSQL_DATABASE="..."
$env:STORE_FILES_IN_DB="1"   # use when destination is cloud
npm run migrate:mysql
```

---

## Step 5 — Daily backups (after go-live)

From **Backup & Settings** on the cloud URL:

- Click **Backup now**
- **Download** any ZIP to the phone/PC
- Copy into Google Drive / OneDrive (recommended weekly)

The server also creates an automatic ZIP each evening (keeps the last **14**).

---

## Step 6 — Use on mobile

1. Open the Render URL in Chrome / Safari.
2. Optional: **Add to Home Screen**.
3. Sign in with the `CLINIC_PASSWORD` you set on Render.

---

## Keep using only the PC (no cloud)

1. Install [MySQL 8+](https://dev.mysql.com/downloads/mysql/) locally.
2. Copy `.env.example` → `.env` and set `MYSQL_PASSWORD`.
3. Double-click `start-clinic.bat` and open `http://localhost:5173`.

---

## Security notes

- Change the clinic password after the first cloud deploy (`CLINIC_PASSWORD` + Backup & Settings).
- Do not share the Render URL publicly; treat it like clinic records.
- Prefer hospital Wi‑Fi or trusted mobile data when entering patient data.
- Keep at least one backup ZIP outside the server (Google Drive / USB).
- Never commit `.env` to GitHub.
