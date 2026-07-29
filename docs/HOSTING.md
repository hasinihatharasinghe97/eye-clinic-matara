# Free cloud hosting — Eye Clinic Matara

Run the clinic on the internet (phone + browser) at **no monthly cost**.

## Choose a stack

| Goal | Database / host | App | Disk for uploads |
|------|-----------------|-----|------------------|
| **More storage (recommended)** | [Oracle Always Free VM](HOSTING-ORACLE.md) (MySQL on the VM) | Same VM | VM disk (tens of GB) |
| **Quickest signup** | [Aiven free MySQL](https://aiven.io/free-mysql-database) (~**1 GB**) | [Render](https://render.com) free | Inside MySQL (`STORE_FILES_IN_DB=1`) |
| **Oracle managed 50 GB** | HeatWave Always Free + NLB | Render | Inside MySQL — see [HOSTING-ORACLE.md](HOSTING-ORACLE.md) |

Printable lists: [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md) · Oracle steps: [HOSTING-ORACLE.md](HOSTING-ORACLE.md)

---

## Backup system

Every ZIP contains:

- `snapshot.json` — patients, visits, progress, attachments metadata, disease assessments, custom forms  
- `uploads/` — report images / PDFs  
- `README-RESTORE.txt` — restore instructions  

### Automatic

- If the last backup is **older than ~20 hours**, the server creates one on the next check (covers free hosts that sleep).  
- On always-on machines, an evening backup also runs.  
- Keeps the last **14** ZIPs on disk (PC/Oracle VM) or **7** in MySQL (cloud / `STORE_FILES_IN_DB`). Override with `BACKUP_KEEP`.

### Manual + offsite (required)

1. **Backup & Settings** → **Backup now** → **Download latest**  
2. Copy the ZIP to **Google Drive / OneDrive / USB** (weekly minimum; two locations is better)  
3. Do not rely only on Aiven/Oracle/Render storage  

### Restore

```powershell
# Destination MYSQL_* in .env or env vars; empty DB preferred
$env:STORE_FILES_IN_DB="1"   # only when destination stores files in MySQL
node scripts/restore-from-backup.mjs .\EyeClinic-Backup-2026-....zip
```

Also: `npm run export:snapshot` writes `data/backups/snapshot.json` without a full ZIP.

---

## Path A — Oracle VM (more storage)

Follow **[HOSTING-ORACLE.md](HOSTING-ORACLE.md)** end to end (create VM → install MySQL/Node → systemd → import data → backups).

---

## Path B — Aiven MySQL + Render (simple, 1 GB)

### B1 — Aiven free MySQL

1. Sign up at https://aiven.io  
2. Create **MySQL** → plan **Free**  
3. Copy Host, Port, User, Password, Database (`defaultdb` is common)  
4. Public hostname is fine for Render  

### B2 — GitHub

Repo: https://github.com/hasinihatharasinghe97/eye-clinic-matara — push `main` after local changes. Never commit `.env`.

### B3 — Render free Web Service

**Use Node runtime, not Docker.**

| Field | Value |
|--------|--------|
| Build | `npm ci && npm ci --prefix server && npm ci --prefix client && npm run build --prefix client` |
| Start | `node server/src/index.js` |
| Plan | Free |

Env vars:

| Variable | Value |
|----------|--------|
| `MYSQL_HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` | from Aiven |
| `MYSQL_SSL` | `1` (Aiven usually needs TLS) |
| `STORE_FILES_IN_DB` | `1` |
| `CLINIC_PASSWORD` | strong password |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |

Cold start after idle: ~30–60s.

### B4 — Copy PC data into Aiven

```powershell
cd D:\eye-clinic
npm run export:snapshot

$env:MYSQL_HOST="YOUR_AIVEN_HOST"
$env:MYSQL_PORT="YOUR_AIVEN_PORT"
$env:MYSQL_USER="avnadmin"
$env:MYSQL_PASSWORD="YOUR_AIVEN_PASSWORD"
$env:MYSQL_DATABASE="defaultdb"
$env:MYSQL_SSL="1"
$env:STORE_FILES_IN_DB="1"

node scripts/migrate-sqlite-to-mysql.mjs .\data\backups\snapshot.json
# or: node scripts/restore-from-backup.mjs .\path\to\backup.zip
```

---

## Use on mobile

Open the public URL → sign in with `CLINIC_PASSWORD` → optional Add to Home Screen.

---

## Keep using only the PC

1. Local MySQL 8+  
2. `.env` from `.env.example`  
3. `start-clinic.bat` → http://localhost:5173  

---

## Security

- Strong clinic + MySQL passwords  
- Do not share the public URL widely  
- Weekly offsite ZIP backups  
- Never commit `.env`  
