# SSIAR Production Deployment Guide

## Architecture

```

## Azure VM Setup

### Step 1 — VM details
- **Size**: B2s (2 vCPU, 4GB RAM) — ~₹1,500/mo, well within your ₹12k remaining credits
- **OS**: Ubuntu 22.04 LTS
- **Data disk**: Add a 64GB Standard SSD (attach as `/dev/sdc`)
- **Ports open**: SSH (22), HTTP (80), HTTPS (443)
- **SSH key**: Paste your public key

### Step 2 — Once VM is provisioned

SSH in:

```bash
ssh azureuser@<VM_IP>
```

Run the bootstrap script:

```bash
wget -O bootstrap.sh https://raw.githubusercontent.com/YOUR_USERNAME/ssiar/main/azure-bootstrap.sh
chmod +x bootstrap.sh
nano backend/.env   # ← paste your Azure DI key
./bootstrap.sh
```

Or step-by-step:

```bash
# 1. Format and mount data disk
sudo mkfs.ext4 /dev/sdc
sudo mkdir -p /data
sudo mount /dev/sdc /data
echo '/dev/sdc /data ext4 defaults 0 0' | sudo tee -a /etc/fstab

# 2. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# 3. Clone repo
cd /data
git clone https://github.com/YOUR_USERNAME/ssiar.git
cd ssiar

# 4. Set Azure key
echo "AZURE_DOC_INTELLIGENCE_KEY=YOUR_KEY_HERE" >> backend/.env

# 5. Build & start
docker compose up -d --build
```

### Step 3 — Verify

```bash
curl http://localhost:8000/docs
curl http://localhost:8000/api/queue-status
```

### Step 4 — HTTPS (Caddy)

```bash
sudo apt install caddy -y
# Copy azure-caddyfile to /etc/caddy/Caddyfile, edit the domain
sudo systemctl restart caddy
```

### Step 5 — Frontend

Deploy `frontend/dist/` to **Cloudflare Pages** or **Azure Static Web Apps** (free tier).

Set env var: `VITE_API_BASE=https://your-domain.com/api`

## Processing 5000 PDFs

```bash
# Upload manually via web UI at https://your-domain.com

# Or copy via SCP
scp /local/pdfs/*.pdf azureuser@<IP>:/data/ssiar/shared/uploads/
```

With 4 workers × ~30s per doc = **~10 hours**. Start it, go to bed, done by morning.

Cost: only Azure DI pages used (~₹1,200 of your remaining ₹12k credits).

## Backups

```bash
# Backup SQLite database
cp /data/ssiar/shared/database/ssiar.db backup_$(date +%Y%m%d).db

# Backup uploaded PDFs
tar czf uploads_$(date +%Y%m%d).tar.gz /data/ssiar/shared/uploads/

# Restore
cp backup_20250101.db /data/ssiar/shared/database/ssiar.db
```

## Monitoring

```bash
docker compose logs --tail=50 -f
docker stats
```

## Cost Summary (using your existing Azure trial)

| Item | Cost | Source |
|------|------|--------|
| B2s VM (1 month) | ~₹1,500 | Azure credits |
| 64GB SSD (1 month) | ~₹200 | Azure credits |
| Azure DI (10K pages) | ~₹1,200 | Azure credits |
| Frontend hosting | $0 | Cloudflare Pages |
| **Total** | **~₹2,900** | **You have ₹12k left** |

## Troubleshooting

**App won't start**: Check `docker compose logs app`. Verify Azure DI key in `backend/.env`.
**OCR failing**: `curl -X POST -F 'files=@test.pdf' http://localhost:8000/api/upload` — check logs.
**Images not loading**: Verify `shared/processed/` directory has files.
**Out of disk**: `docker system prune -a` to clean old images.
