#!/usr/bin/env bash
# Create the Cliper Agent VM on a Proxmox VE host (7.2 or newer). Run on the Proxmox node as root:
#
#   bash create-vm.sh                      # sensible defaults, asks nothing
#   VMID=120 CORES=8 MEMORY=16384 DISK=200 STORAGE=local-lvm bash create-vm.sh
#
# It downloads the Ubuntu 24.04 cloud image, creates the VM with cloud-init (your SSH key, DHCP), and
# starts it. Nothing else on the node is touched. Afterwards: ssh in and follow the three commands it prints.
set -euo pipefail

VMID="${VMID:-$(pvesh get /cluster/nextid)}"
NAME="${NAME:-cliper-agent}"
# Rendering is CPU work: every core you can spare makes clips faster (4 is a comfortable minimum)
CORES="${CORES:-4}"
MEMORY="${MEMORY:-8192}"          # MB
DISK="${DISK:-100}"               # GB: holds the clips for KEEP_JOBS_DAYS
STORAGE="${STORAGE:-local-lvm}"   # where the VM disk lives (pvesm status lists yours)
BRIDGE="${BRIDGE:-vmbr0}"
CI_USER="${CI_USER:-cliper}"
SSH_KEYS="${SSH_KEYS:-/root/.ssh/authorized_keys}"
# ip=dhcp, or a fixed address: IPCONFIG="ip=192.168.1.50/24,gw=192.168.1.1"
IPCONFIG="${IPCONFIG:-ip=dhcp}"
IMAGE_URL="${IMAGE_URL:-https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img}"
IMAGE="/var/lib/vz/template/iso/$(basename "$IMAGE_URL")"

command -v qm >/dev/null || { echo "Run this on the Proxmox node itself (qm not found)." >&2; exit 1; }
if qm status "$VMID" >/dev/null 2>&1; then echo "VM $VMID already exists. Pick another: VMID=… bash $0" >&2; exit 1; fi
pvesm status --storage "$STORAGE" >/dev/null 2>&1 || { echo "Storage '$STORAGE' not found. Yours: $(pvesm status | awk 'NR>1{print $1}' | xargs)" >&2; exit 1; }
[ -s "$SSH_KEYS" ] || { echo "No SSH public key at $SSH_KEYS. Point SSH_KEYS at your .pub file (password logins stay off)." >&2; exit 1; }

if [ ! -s "$IMAGE" ]; then
  echo "▶ Downloading the Ubuntu 24.04 cloud image…"
  mkdir -p "$(dirname "$IMAGE")"
  wget -q --show-progress -O "$IMAGE.part" "$IMAGE_URL"
  mv "$IMAGE.part" "$IMAGE"
fi

echo "▶ Creating VM $VMID ($NAME): $CORES cores, $MEMORY MB, $DISK GB on $STORAGE…"
# cpu=host passes the processor's real instruction set (AVX2 …) to the VM: x264 is much slower without it
qm create "$VMID" --name "$NAME" --ostype l26 --machine q35 \
  --cpu host --cores "$CORES" --memory "$MEMORY" --balloon 0 \
  --net0 "virtio,bridge=$BRIDGE" --scsihw virtio-scsi-single \
  --agent enabled=1 --onboot 1 --serial0 socket --vga serial0
qm set "$VMID" --scsi0 "$STORAGE:0,import-from=$IMAGE,discard=on,iothread=1,ssd=1"
qm set "$VMID" --ide2 "$STORAGE:cloudinit" --boot order=scsi0
qm set "$VMID" --ciuser "$CI_USER" --sshkeys "$SSH_KEYS" --ipconfig0 "$IPCONFIG"
qm resize "$VMID" scsi0 "${DISK}G"
qm start "$VMID"

cat <<DONE

✅ VM $VMID is starting. Its address shows under Summary in the Proxmox web UI in about a minute
   (or: qm guest cmd $VMID network-get-interfaces, once the guest agent is installed by step 2).

Next, on the VM (ssh $CI_USER@<its address>):

  1.  git clone https://github.com/WatchDog386/cliper-agent.git && cd cliper-agent
  2.  sudo bash deploy/install.sh
  3.  cp deploy/.env.example deploy/.env && nano deploy/.env      # passwords, PUBLIC_URL, social keys
      bash deploy/deploy.sh

Graphics card for faster rendering, HTTPS and tunnels: docs/PROXMOX.md
DONE
