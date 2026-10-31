# Running the clinic offline on the doctor's laptop

The clinic has no internet signal, so the app also runs **on the doctor's laptop with its own
database**. The doctor can use **either** app — the laptop app (works with no internet) or the
hosted online app — even on the same day. Whenever the laptop has a **stable internet
connection**, the two databases are synced **automatically, both ways**:

- work done on the laptop goes up to the cloud (Oracle HeatWave), and
- changes made in the online app come down to the laptop.

```
 Clinic (no internet)                           Anywhere with internet
 ┌──────────────────────────┐   automatic   ┌────────────────────────────┐
 │ Doctor's laptop          │ ◀──────────▶  │ Oracle HeatWave (cloud DB) │ ◀──▶ online app (Render)
 │ app + local MySQL        │   two-way     │                            │
 └──────────────────────────┘   sync        └────────────────────────────┘
```

**Example.** The doctor edits a patient in the online app; the internet drops; he continues on
the laptop app. The laptop already has that edit, because while it was online it checked every
2 minutes and pulled it down. Anything he then does on the laptop goes up automatically once the
internet is back.

> Changes made online in the **last minute or two before the internet drops** can't reach the
> laptop until it is online again — there is no way to fetch data without a connection. Keep the
> laptop app (or the background task) running while using the online app so it stays current.

## How the sync works

- **Every 2 minutes while the laptop app is open** (and every 5 minutes in the background with
  *Background sync ON* in `clinic-tools.bat`), the laptop makes one quick connection to the cloud and compares
  fingerprints of both databases with the last sync. No internet → it waits. Nothing changed →
  nothing happens.
- **Something changed → it checks the connection is stable** (the cloud must answer quickly
  3 times in a row, 5 seconds apart), then syncs both ways: new, changed and deleted records,
  and photos.
- **Same record changed in both places** → the **newer edit is kept**, and the sync result lists
  it (Backup & Settings → *see which version was kept*). A record deleted in one place but edited
  in the other is **kept** (the edit is not thrown away).
- **Record numbers never clash**: new records get **odd numbers online** and **even numbers on the
  laptop**.
- **All or nothing**: if the connection drops during a sync, nothing is half-changed; the next
  sync finishes the job. A record being edited while a sync runs is left alone and synced next time.
- **Safety stops** (automatic sync pauses and the home page shows a warning):
  - a sync would delete a large part of a table on one side (e.g. an empty or wrong database);
  - two different records turned up with the same number (e.g. an outdated online app).

## One-time setup

Needs internet for the setup steps.

1. **Deploy this version of the app online (Render) first.** It is what makes the online app
   use odd record numbers.
2. On the laptop, **install Node.js 22+** from <https://nodejs.org/>.
3. **Install MySQL 8 or newer (Community Server)** from <https://dev.mysql.com/downloads/installer/>.
   Choose *Server only*, keep port **3306**, set a **root password** and write it down, and let
   it run as a Windows service (starts automatically with Windows).
4. **Copy the project folder** to the laptop (e.g. `C:\EyeClinic`).
5. In that folder, copy **`.env.laptop.example`** to **`.env`** and fill in:
   - `MYSQL_PASSWORD` — the root password from step 3 (the laptop's own database).
   - `CLOUD_MYSQL_HOST`, `CLOUD_MYSQL_USER`, `CLOUD_MYSQL_PASSWORD` — the HeatWave values the
     online app already uses.
   - `CLINIC_PASSWORD` — the login password for the app on the laptop.
6. Run **`start-clinic.bat`** once. It installs what it needs and creates the laptop's empty
   database. Close it after the app opens (Ctrl+C).
7. Run **`clinic-tools.bat`** and choose **5. First-time copy from cloud**. It copies every
   patient, visit and photo from HeatWave onto the laptop (command line: `npm run cloud:pull`).
   Automatic sync starts after this.
8. In **`clinic-tools.bat`**, choose **3. Background sync ON** once, so Windows also syncs in the
   background every 5 minutes (no window opens) when the laptop app is closed.
   **4. Background sync OFF** turns it off.

**Laptop already set up with the earlier one-way version?** Nothing to redo. Its first sync
upgrades it: if the cloud wasn't changed since its last sync, the laptop's pending work is sent
up and two-way syncing starts. If the cloud was changed meanwhile, the sync stops and asks which
copy to keep (see *Recovery* below).

## Every day

- Use the laptop app (`start-clinic.bat`, then <http://localhost:5173>) and/or the online app.
- That's it. **Backup & Settings → Sync with the online app** shows the last sync, the last
  automatic check, and any records that were changed in both places.
- To sync straight away: **Sync now** there, or `clinic-tools.bat` → **1. Sync now**
  (command line: `npm run cloud:push`). **2. Sync status** (or `npm run cloud:status`) shows the
  current state.

## Settings (laptop `.env`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `CLOUD_AUTO_SYNC` | on | `0` turns automatic sync off while the app is open (manual only). |
| `CLOUD_AUTO_SYNC_MINUTES` | `2` | How often the open app checks. |
| `CLOUD_SYNC_STABLE_CHECKS` | `3` | Quick connection checks (5 s apart) required before syncing. |

The background task's 5-minute interval is set in `clinic-tools.bat` (*Background sync ON*).

## If something goes wrong

| Message | What to do |
| --- | --- |
| Last check: *no internet* / *connection not stable yet* | Normal when offline. It syncs by itself once the connection is good. |
| *This sync would delete N of M … rows* | One database looks damaged or empty, or a lot was deleted on purpose. If it was on purpose, press **Sync anyway**; otherwise check `.env` and contact support. |
| *Two different … records were created with the same number* | The online app is probably an older version. Deploy this version online, then contact support to merge the two records. |
| *Upgrading to two-way sync: the cloud was changed …* | Decide which copy is correct, then run one recovery command below. |
| *MYSQL_\* and CLOUD_MYSQL_\* point at the same database* | In the laptop's `.env`, `MYSQL_*` must be the laptop's own MySQL (`127.0.0.1`). |

Automatic attempts (except "nothing to do") are logged in `data\cloud-sync.log`; the background
task's output is in `data\cloud-sync-task.log`.

### Recovery (replace one side with the other)

- `node scripts\cloud-sync.mjs overwrite-cloud` — the cloud becomes an exact copy of the laptop.
- `node scripts\cloud-sync.mjs pull --force` — the laptop becomes an exact copy of the cloud.

Both make normal two-way sync continue from that point.

## Backups

The laptop keeps its own ZIP backups in `data\backups` (Backup & Settings → *Backup now*). The
cloud has its nightly Google Drive backup. Work done on the laptop while offline is only on the
laptop until it syncs, so keep backing up the laptop too.

## Notes

- The login password, backup folder and Google Drive settings are **not** synced; the laptop
  and the online app each keep their own.
- The app and the background task never sync at the same time (`data\cloud-sync.lock`; a lock
  left by a crash is ignored after 30 minutes).
- Sync state (last sync and the per-row fingerprints from it) is in
  `data\cloud-sync-state.json` on the laptop. If it is deleted, run `pull --force` or
  `overwrite-cloud` once to start again.
- Only **one** laptop should sync with the cloud. Moving to a new laptop: set it up with the
  steps above (the copy from the cloud brings everything across), then stop using the old one.
