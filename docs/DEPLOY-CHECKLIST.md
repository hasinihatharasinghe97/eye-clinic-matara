# Cloud deploy checklist

Code: https://github.com/hasinihatharasinghe97/eye-clinic-matara  

Guides: [HOSTING.md](HOSTING.md) · [HOSTING-ORACLE.md](HOSTING-ORACLE.md)

---

## Option 1 — Oracle Always Free VM (more storage) ← recommended

1. [ ] Oracle Free Tier account → create Ubuntu **Ampere A1** VM with public IP  
2. [ ] Open ports 22, 80, 443, 3001  
3. [ ] Install MySQL + Node 22; create DB `eye_clinic`  
4. [ ] Clone repo; set `.env` (local MySQL; leave `STORE_FILES_IN_DB` off)  
5. [ ] `npm run install:all` && build client; enable `eye-clinic` systemd service  
6. [ ] On clinic PC: `npm run export:snapshot` → copy snapshot + uploads to VM → import  
7. [ ] Backup & Settings → Backup now → Download → Google Drive + USB  

Details: [HOSTING-ORACLE.md](HOSTING-ORACLE.md)

---

## Option 2 — Aiven (1 GB) + Render

1. [ ] Aiven free MySQL → copy connection info  
2. [ ] Render Web Service (Node) → env:

```
MYSQL_HOST=...
MYSQL_PORT=...
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=defaultdb
MYSQL_SSL=1
STORE_FILES_IN_DB=1
CLINIC_PASSWORD=...
NODE_ENV=production
NODE_VERSION=22
```

3. [ ] Deploy once; open URL  
4. [ ] Import:

```powershell
npm run export:snapshot
$env:MYSQL_SSL="1"
$env:STORE_FILES_IN_DB="1"
# set MYSQL_* to Aiven
node scripts/migrate-sqlite-to-mysql.mjs .\data\backups\snapshot.json
```

5. [ ] Weekly: Backup now → Download → Drive/USB  

---

## Backup habit (both options)

| When | Action |
|------|--------|
| After go-live | Backup now + download once |
| Weekly | Download latest ZIP → Drive + USB |
| Disaster | `node scripts/restore-from-backup.mjs <zip>` into empty MySQL |

Server also auto-backs up when the last ZIP is older than ~20 hours.
