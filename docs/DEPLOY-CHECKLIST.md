# Cloud deploy checklist (do these on your accounts)

Code is already on GitHub: https://github.com/hasinihatharasinghe97/eye-clinic-matara

Full guide: [HOSTING.md](HOSTING.md)

## 1) Aiven free MySQL

1. https://aiven.io → create **MySQL Free**
2. Copy Host, Port, User, Password, Database (`defaultdb` is common)

## 2) Render free Web Service

1. https://dashboard.render.com → **New** → **Web Service** (Node, **not** Docker)
2. Connect repo `eye-clinic-matara`, branch `main`
3. Build: `npm ci && npm ci --prefix server && npm ci --prefix client && npm run build --prefix client`
4. Start: `node server/src/index.js`
5. Env vars:

```
MYSQL_HOST=<aiven host>
MYSQL_PORT=<aiven port>
MYSQL_USER=<aiven user>
MYSQL_PASSWORD=<aiven password>
MYSQL_DATABASE=<aiven database>
STORE_FILES_IN_DB=1
CLINIC_PASSWORD=<choose a strong password>
NODE_ENV=production
NODE_VERSION=22
```

6. Deploy once and open the `*.onrender.com` URL (wait for first boot)

## 3) Copy local data (clinic PC)

```powershell
cd D:\eye-clinic

# Export from local MySQL (.env must point at local DB)
npm run export:snapshot

# Then point at Aiven and import:
$env:MYSQL_HOST="..."
$env:MYSQL_PORT="..."
$env:MYSQL_USER="..."
$env:MYSQL_PASSWORD="..."
$env:MYSQL_DATABASE="defaultdb"
$env:STORE_FILES_IN_DB="1"
node scripts/migrate-sqlite-to-mysql.mjs .\data\backups\snapshot.json
```

Paste your Aiven connection values here in chat if you want the import command run for you.
