#!/bin/bash
set -e

VM_IP="20.193.129.253"
SSH_KEY="$HOME/Downloads/ssiar-vm_key.pem"
REMOTE_DIR="/home/azureuser/SSIAR"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== SSIAR Deploy ==="
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"

# 1. Build frontend locally
echo "[1/4] Building frontend..."
cd "$LOCAL_DIR/frontend" && npm run build

# 2. Push latest code to GitHub
echo "[2/4] Pushing to GitHub..."
cd "$LOCAL_DIR" && git push origin main

# 3. Pull code on VM, sync frontend dist + .env
echo "[3/4] Deploying to VM..."
$SSH azureuser@$VM_IP "
  cd $REMOTE_DIR
  git pull origin main
" 
rsync -avz --delete -e "$SSH" "$LOCAL_DIR/frontend/dist/" "azureuser@$VM_IP:$REMOTE_DIR/frontend/dist/"
scp -q -i "$SSH_KEY" -o StrictHostKeyChecking=no "$LOCAL_DIR/backend/.env" "azureuser@$VM_IP:$REMOTE_DIR/backend/.env"

$SSH azureuser@$VM_IP "
  sudo rsync -aqz --delete $REMOTE_DIR/frontend/dist/ /var/www/ssiar/dist/
"

# 4. Rebuild and restart Docker
echo "[4/4] Rebuilding Docker..."
$SSH azureuser@$VM_IP "
  cd $REMOTE_DIR
  set -a && . ./backend/.env && set +a
  sudo -E docker compose -f infra/docker-compose.yml build --no-cache app
  sudo -E docker compose -f infra/docker-compose.yml up -d
  sleep 2
  curl -s http://localhost:8000/api/v3/system/health
"

echo ""
echo "=== Deploy complete ==="
