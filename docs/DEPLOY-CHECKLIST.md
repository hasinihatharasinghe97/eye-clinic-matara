# Cloud deploy checklist — HeatWave + Render

Code: https://github.com/hasinihatharasinghe97/eye-clinic-matara  

Guide: [HOSTING.md](HOSTING.md)

---

1. [ ] Oracle Always Free **MySQL HeatWave** (`MySQL.Free`, 50 GiB) — Active  
2. [ ] Private subnet + **Network Load Balancer** (TCP 3306) → copy public IP  
3. [ ] Security lists allow TCP **3306**; create database `eye_clinic`  
4. [ ] Render Web Service (Node) → build `npm run build:render`  
5. [ ] Env vars:

```
MYSQL_HOST=<NLB public IP>
MYSQL_PORT=3306
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=eye_clinic
MYSQL_SSL=1
STORE_FILES_IN_DB=1
CLINIC_PASSWORD=...
NODE_ENV=production
NODE_VERSION=22
```

6. [ ] Deploy; open `/api/health` → `ok: true`  
7. [ ] Import from clinic PC:

```powershell
npm run export:snapshot
$env:MYSQL_SSL="1"
$env:STORE_FILES_IN_DB="1"
npm run import:heatwave
```

8. [ ] Backup & Settings → Backup now → Download → Google Drive + USB  

---

## Backup habit

| When | Action |
|------|--------|
| After go-live | Backup now + download once |
| Weekly | Download latest ZIP → Drive + USB |
| Disaster | `node scripts/restore-from-backup.mjs <zip>` into empty MySQL |

Server also auto-backs up when the last ZIP is older than ~20 hours (after wake).
