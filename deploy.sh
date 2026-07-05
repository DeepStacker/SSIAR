#!/bin/bash
set -e

VM_IP="20.193.129.253"
SSH_KEY="$HOME/Downloads/ssiar-vm_key.pem"
REMOTE_DIR="/home/azureuser/SSIAR"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== SSIAR Deploy Script ==="

# 1. Sync backend Python files
echo "[1/4] Syncing backend files..."
rsync -avz --delete -e "ssh -i $SSH_KEY" \
  --include='*.py' --include='requirements.txt' --include='Dockerfile' \
  --exclude='__pycache__' --exclude='*.pyc' --exclude='**/__pycache__/**' \
  "$LOCAL_DIR/backend/" "azureuser@$VM_IP:$REMOTE_DIR/backend/"

# 2. Sync frontend dist to VM + Caddy root
echo "[2/4] Syncing frontend dist..."
rsync -avz --delete -e "ssh -i $SSH_KEY" \
  "$LOCAL_DIR/frontend/dist/" "azureuser@$VM_IP:$REMOTE_DIR/frontend/dist/"
ssh -i "$SSH_KEY" azureuser@"$VM_IP" "sudo rsync -avz --delete $REMOTE_DIR/frontend/dist/ /var/www/ssiar/dist/"

# 3. Sync config files
echo "[3/4] Syncing config files..."
scp -i "$SSH_KEY" "$LOCAL_DIR/docker-compose.yml" "azureuser@$VM_IP:$REMOTE_DIR/"
scp -i "$SSH_KEY" "$LOCAL_DIR/backend/.env" "azureuser@$VM_IP:$REMOTE_DIR/"

# Sync minimal shared (templates + metadata only)
rsync -avz -e "ssh -i $SSH_KEY" \
  "$LOCAL_DIR/shared/templates/" "azureuser@$VM_IP:$REMOTE_DIR/shared/templates/"
rsync -avz -e "ssh -i $SSH_KEY" \
  "$LOCAL_DIR/shared/metadata/" "azureuser@$VM_IP:$REMOTE_DIR/shared/metadata/"

# 4. Rebuild and restart Docker
echo "[4/4] Rebuilding Docker..."
ssh -i "$SSH_KEY" azureuser@"$VM_IP" "
  cd $REMOTE_DIR
  set -a
  . ./.env
  set +a
  sudo -E docker compose build --no-cache app && sudo -E docker compose up -d
"

echo "=== Deploy complete ==="
