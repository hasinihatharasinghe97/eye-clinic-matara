# Running the clinic offline on the doctor's laptop

The clinic has no internet signal, so the app runs **on the doctor's laptop with its own
database**. The laptop is the only place where records are added or changed. At the end of
the day, when the laptop has internet (home Wi-Fi or a phone hotspot), one click makes the
cloud database (Oracle HeatWave) an **exact copy of the laptop**, so the online app shows
the same patients, visits and photos.

```
 Clinic (no internet)                       Home / hotspot (internet)
 ┌──────────────────────────┐   Sync to    ┌────────────────────────────┐
 │ Doctor's laptop          │   cloud ───▶ │ Oracle HeatWave (cloud DB) │◀── online app (Render),
 │ app + local MySQL        │   (daily)    │                            │    view-only
 └──────────────────────────┘              └────────────────────────────┘
```

## How the sync behaves

- **One direction: laptop → cloud.** New and changed records are sent, records deleted on the
  laptop are deleted in the cloud, and new photos are uploaded. Only rows that actually changed
  travel, so a phone hotspot is enough.
- **All or nothing.** If the connection drops halfway, the cloud is left exactly as it was;
  just run the sync again.
- **Protects online edits.** If anything was changed in the cloud since the last sync, the sync
  stops and explains why instead of overwriting it. You can then choose
  *Overwrite cloud with this laptop*.
- **Works offline.** The app on the laptop never needs the internet. The home page shows a
  reminder while today's work is not yet in the cloud.

## One-time laptop setup

Needs internet for the setup steps.

1. **Install Node.js 22+** from <https://nodejs.org/>.
2. **Install MySQL 8 or newer (Community Server)** from <https://dev.mysql.com/downloads/installer/>.
   Choose *Server only*, keep port **3306**, set a **root password** and write it down, and let
   it run as a Windows service (starts automatically with Windows).
3. **Copy the project folder** to the laptop (e.g. `C:\EyeClinic`).
4. In that folder, copy **`.env.laptop.example`** to **`.env`** and fill in:
   - `MYSQL_PASSWORD` — the root password from step 2 (the laptop's own database).
   - `CLOUD_MYSQL_HOST`, `CLOUD_MYSQL_USER`, `CLOUD_MYSQL_PASSWORD` — the HeatWave values the
     online app already uses.
   - `CLINIC_PASSWORD` — the login password for the app on the laptop.
5. Run **`start-clinic.bat`** once. It installs what it needs and creates the laptop's empty
   database. Close it after the app opens (Ctrl+C).
6. Run **`copy-from-cloud.bat`**. It copies every patient, visit and photo from HeatWave onto
   the laptop. (Command line: `npm run cloud:pull`.)
7. On **Render** (the online app), add the environment variable **`READ_ONLY=1`** and redeploy.
   The online app becomes view-only, so nobody makes changes there that the laptop's next sync
   would overwrite. Signing in, viewing, reports, PDFs and backups still work online.

## Every day

1. At the clinic: double-click **`start-clinic.bat`** and open <http://localhost:5173>.
   Everything works without internet.
2. After the clinic: connect the laptop to the internet, then either
   - open **Backup & Settings → Sync to cloud now**, or
   - double-click **`sync-to-cloud.bat`** (command line: `npm run cloud:push`).
3. The card shows *"Everything on this laptop is already in the cloud"* when done.

`npm run cloud:status` shows the last sync time and whether anything is waiting to be synced.

## If something goes wrong

| Message | What to do |
| --- | --- |
| *Could not reach the cloud database* | No internet. Connect and try again. Nothing was changed. |
| *The cloud database was changed since the last sync* | Someone edited the online app (or `READ_ONLY` is not set on Render). If the laptop has the correct records, press **Overwrite cloud with this laptop**. |
| *This laptop has never synced with the cloud* | Run `copy-from-cloud.bat` first (step 6 above). |
| *The laptop database has no patients but the cloud has some* | The laptop's database is empty or `.env` points at the wrong database. Check `.env`; do **not** overwrite. |
| *MYSQL_\* and CLOUD_MYSQL_\* point at the same database* | In the laptop's `.env`, `MYSQL_*` must be the laptop's own MySQL (`127.0.0.1`). |

## Backups

The laptop keeps its own ZIP backups in `data\backups` (Backup & Settings → *Backup now*). Copy
them to a USB drive or Google Drive regularly: until the laptop syncs, the day's records exist
only on the laptop. After each sync, the cloud's nightly Google Drive backup includes them too.

## Notes

- The login password, backup folder and Google Drive settings are **not** synced; the laptop
  and the online app each keep their own.
- Sync state (last sync, fingerprints of what was sent) is stored in
  `data\cloud-sync-state.json` on the laptop. Deleting it makes the next sync ask for
  confirmation before overwriting the cloud.
- Moving to a new laptop: set it up with steps 1–6 (the copy from the cloud brings everything
  across), then stop using the old one.
