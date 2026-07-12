#!/bin/bash
set -e

echo "=== SSIAR Azure VM Bootstrap ==="

# 1. Install Docker
echo "[1/6] Installing Docker..."
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# 2. Create data directory and mount
echo "[2/6] Setting up data disk..."
sudo mkdir -p /data
if lsblk | grep -q sdc; then
  sudo mkfs.ext4 /dev/sdc -F
  sudo mount /dev/sdc /data
  echo '/dev/sdc /data ext4 defaults 0 0' | sudo tee -a /etc/fstab
fi

# 3. Clone repo (will prompt for credentials if not set up)
echo "[3/6] Cloning repository..."
cd /data
git clone https://github.com/YOUR_USERNAME/ssiar.git
cd ssiar

# 4. Set up .env
echo "[4/6] Configuring environment..."
echo "AZURE_DOC_INTELLIGENCE_ENDPOINT=https://sumeru.cognitiveservices.azure.com/" > backend/.env
echo "AZURE_DOC_INTELLIGENCE_KEY=REPLACE_WITH_YOUR_KEY" >> backend/.env
echo "MAX_WORKERS=4" >> backend/.env
echo "SURYA_ENABLED=0" >> backend/.env
echo ""
echo "⚠️  EDIT YOUR AZURE KEY: nano /data/ssiar/backend/.env"
echo ""

# 5. Build and start
echo "[5/6] Building Docker image..."
docker compose build

echo "[6/6] Starting application..."
docker compose up -d

echo ""
echo "=== DONE ==="
echo "App running at http://localhost:8000"
echo "API docs at http://localhost:8000/docs"
echo ""
echo "Upload PDFs via the web UI or:"
echo "  curl -X POST -F 'files=@/data/sample.pdf' http://localhost:8000/api/upload"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop:     docker compose down"
