# Cloud hosting — HeatWave (50 GB) + Render

**App:** [Render](https://render.com) free Web Service  
**Database:** Oracle MySQL HeatWave Always Free (~50 GiB) via Network Load Balancer  
**Files:** stored in MySQL (`STORE_FILES_IN_DB=1`)

Checklist: [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md)

---

## 1. Oracle HeatWave MySQL

1. OCI Console → **Databases** → **HeatWave MySQL** → **Create DB system**
2. Template: **Always Free** (`MySQL.Free`, 50 GiB)
3. Admin user + strong password (save them)
4. Place the DB on a **private subnet** in your VCN
5. Wait until status is **Active**
6. Note the **private IP** and port **3306**

Create the app database (DBeaver / MySQL client via NLB after step 2):

```sql
CREATE DATABASE IF NOT EXISTS eye_clinic
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 2. Network Load Balancer (public MySQL endpoint)

HeatWave has no public IP. Expose it with an NLB:

1. **Networking** → **Network Load Balancer** → **Create** (Public)
2. Same VCN; subnet = **public** subnet
3. Listener: **TCP 3306**, idle timeout **120**
4. Backend set: health check **TCP 3306**, **Preserve source IP = OFF**
5. Add backend: HeatWave **private IP**, port **3306**
6. Security lists / NSG: allow **TCP 3306** to the NLB and from the NLB to the private subnet
7. Copy the NLB **public IP** → this is `MYSQL_HOST`

---

## 3. Render Web Service

Repo: https://github.com/hasinihatharasinghe97/eye-clinic-matara  

**Use Node runtime, not Docker.**

| Field | Value |
|--------|--------|
| Build | `npm run build:render` |
| Start | `node server/src/index.js` |
| Plan | Free |

Environment variables:

| Variable | Value |
|----------|--------|
| `MYSQL_HOST` | NLB public IP |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | HeatWave admin user |
| `MYSQL_PASSWORD` | HeatWave password |
| `MYSQL_DATABASE` | `eye_clinic` |
| `MYSQL_SSL` | `1` |
| `STORE_FILES_IN_DB` | `1` |
| `CLINIC_PASSWORD` | clinic login password |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |

Cold start after idle: ~30–60s. Open `/api/health` — `ok: true` means MySQL is reachable.

---

## 4. Import clinic PC data

```powershell
cd D:\eye-clinic
npm run export:snapshot

# Point MYSQL_* at HeatWave (via NLB) — use .env or env vars:
$env:MYSQL_SSL="1"
$env:STORE_FILES_IN_DB="1"
npm run import:heatwave
# or:
node scripts/restore-from-backup.mjs .\EyeClinic-Backup-....zip
```

---

## Backup system

Every ZIP contains `snapshot.json`, `uploads/`, and restore notes.

- **Automatic:** if the last backup is older than ~20 hours (delayed a few minutes after wake on Render so the UI stays responsive)
- **Keeps** last **7** ZIPs in MySQL by default (`BACKUP_KEEP`)
- **Offsite (required):** Backup & Settings → **Backup now** → **Download** → Google Drive + USB weekly

```powershell
$env:STORE_FILES_IN_DB="1"
node scripts/restore-from-backup.mjs .\EyeClinic-Backup-....zip
```

---

## Security

- Strong `MYSQL_PASSWORD` and `CLINIC_PASSWORD`
- Prefer locking NLB ingress to known IPs when possible (Render egress can change on free tier)
- Never commit `.env`
- Treat the public clinic URL as confidential
