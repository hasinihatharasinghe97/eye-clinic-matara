# Host on Oracle Cloud (50 GB+) — Eye Clinic Matara

Recommended when you need **more storage than Aiven’s 1 GB**. Oracle Cloud Free Tier includes Always Free resources you can keep indefinitely (subject to Oracle’s terms).

| Piece | What we use | Storage |
|--------|-------------|---------|
| App + MySQL | **One Always Free VM** (Ampere A1 / Ubuntu) | Boot volume (tens of GB; part of Always Free block storage) |
| Public URL | VM public IP (or free Cloudflare Tunnel / nginx + HTTPS) | — |
| Backups | In-app ZIP + Google Drive / USB | Separate from Oracle |

> **Why not MySQL HeatWave Alone Free + Render?** HeatWave sits on a **private** network. Reachable from the public internet only via a Network Load Balancer or SSH bastion — more setup. Putting **app + MySQL on one Oracle VM** is simpler for a clinic.

Full backup / restore behaviour is described in [HOSTING.md](HOSTING.md#backup-system) and on the **Backup & Settings** page.

---

## Step 1 — Oracle Free Tier account

1. Sign up: https://www.oracle.com/cloud/free/
2. Complete identity verification (may require a credit card for fraud checks — Always Free resources are still $0 if you stay within free limits).
3. Pick a **home region** close to Sri Lanka if available (e.g. Mumbai / Singapore).

---

## Step 2 — Create an Always Free compute VM

1. OCI Console → **Compute** → **Instances** → **Create instance**.
2. Name: `eye-clinic`.
3. Image: **Canonical Ubuntu 22.04** (or 24.04).
4. Shape: **Ampere** → Always Free-eligible (e.g. `VM.Standard.A1.Flex`, 2 OCPU / 12 GB RAM is enough).
5. Networking: assign a **public IPv4**.
6. Download the SSH key (`.key` / `.pem`) and store it safely.
7. Create the instance and wait until it is **Running**. Note the **Public IP**.

### Open firewall ports

**Subnet security list / NSG** — ingress:

| Source | Protocol | Ports |
|--------|----------|--------|
| `0.0.0.0/0` | TCP | 22 (SSH) |
| `0.0.0.0/0` | TCP | 80, 443 (web) |
| `0.0.0.0/0` | TCP | 3001 (app, if not using nginx yet) |

Also allow the same ports in **iptables/ufw** on the VM after login if needed.

---

## Step 3 — Install MySQL + Node on the VM

SSH from your PC (PowerShell example):

```powershell
ssh -i path\to\your-key.key ubuntu@YOUR_PUBLIC_IP
```

On the VM:

```bash
sudo apt update
sudo apt install -y mysql-server nginx git

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'CHOOSE_A_STRONG_PASSWORD'; FLUSH PRIVILEGES;"
sudo mysql -e "CREATE DATABASE IF NOT EXISTS eye_clinic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

---

## Step 4 — Deploy the app

```bash
cd /home/ubuntu
git clone https://github.com/hasinihatharasinghe97/eye-clinic-matara.git eye-clinic
cd eye-clinic

cp .env.example .env
nano .env
```

Set at least:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=CHOOSE_A_STRONG_PASSWORD
MYSQL_DATABASE=eye_clinic
CLINIC_PASSWORD=your_clinic_login_password
# Leave STORE_FILES_IN_DB unset — files stay on the VM disk (better for Oracle VM)
```

Then:

```bash
npm run install:all
npm run build --prefix client

# Quick test
node server/src/index.js
# Visit http://YOUR_PUBLIC_IP:3001  then Ctrl+C
```

### Run with systemd (survives reboot)

```bash
sudo nano /etc/systemd/system/eye-clinic.service
```

```ini
[Unit]
Description=Eye Clinic Matara
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/eye-clinic
EnvironmentFile=/home/ubuntu/eye-clinic/.env
ExecStart=/usr/bin/node server/src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now eye-clinic
sudo systemctl status eye-clinic
```

### Optional — nginx reverse proxy on port 80

```nginx
server {
  listen 80;
  server_name _;
  client_max_body_size 40m;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Then open `http://YOUR_PUBLIC_IP` (add HTTPS later with Certbot if you have a domain).

---

## Step 5 — Copy clinic PC data to Oracle

On the **clinic PC** (local MySQL):

```powershell
cd D:\eye-clinic
npm run export:snapshot
```

Copy `data\backups\snapshot.json` and the `data\uploads` folder to the VM (scp / USB), then on the VM:

```bash
cd /home/ubuntu/eye-clinic
# .env already points at local MySQL on the VM
node scripts/migrate-sqlite-to-mysql.mjs ./snapshot.json
# Ensure uploads/ sits beside snapshot.json OR under data/uploads
```

Or restore a full ZIP:

```bash
node scripts/restore-from-backup.mjs ./EyeClinic-Backup-....zip
```

---

## Step 6 — Backup system on Oracle

Same app backup system as elsewhere:

1. **Automatic:** if the last backup is older than ~20 hours, the server creates one; also runs in the evening on always-on VMs.
2. **On disk:** ZIPs go under `data/backups` (or your chosen folder). Last **14** kept by default.
3. **Offsite (mandatory):** Backup & Settings → **Backup now** → **Download latest** → Google Drive + USB weekly.
4. **Restore:** `node scripts/restore-from-backup.mjs <zip>`

Oracle’s own VM snapshots / boot volume backups are optional extras — they do **not** replace downloading clinic ZIPs.

---

## Alternative: HeatWave MySQL (50 GB) + Render

Only if you specifically want managed HeatWave:

1. Create Always Free **MySQL HeatWave** DB system (50 GiB).
2. Expose it with a **Network Load Balancer** on TCP 3306 (HeatWave has no public IP by default).
3. Deploy the app on **Render** with:

```env
MYSQL_HOST=<NLB public IP or hostname>
MYSQL_PORT=3306
MYSQL_USER=<admin user>
MYSQL_PASSWORD=...
MYSQL_DATABASE=eye_clinic
MYSQL_SSL=1
STORE_FILES_IN_DB=1
CLINIC_PASSWORD=...
```

4. Import data with `STORE_FILES_IN_DB=1` as in [HOSTING.md](HOSTING.md).

This uses HeatWave’s 50 GB for data + uploads in MySQL. Prefer the **single VM** path unless you need managed MySQL.

---

## Security checklist

- Strong `MYSQL_PASSWORD` and `CLINIC_PASSWORD`
- Restrict SSH to your IP if possible
- Do not commit `.env`
- Treat the public URL as confidential clinic access
- Keep offsite ZIP backups every week
