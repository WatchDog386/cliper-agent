# Running Cliper Agent on Proxmox

One VM runs everything in Docker: the API (with ffmpeg and yt-dlp), PostgreSQL, the web app behind Caddy
(automatic HTTPS) and a daily database backup.

## 1. Size the VM

Rendering video is CPU work, so cores are what make it fast.

| | Minimum | Comfortable | Heavy use |
|---|---|---|---|
| Cores | 4 | 8 | 16 |
| Memory | 4 GB | 8 GB | 16 GB |
| Disk | 60 GB | 150 GB | 500 GB+ |

Two settings matter more than the numbers:

- **CPU type `host`.** The default (`kvm64` / `x86-64-v2`) hides AVX2 from the VM and x264 runs far slower
  without it. The script below sets it.
- **Memory ballooning off**, so ffmpeg never gets squeezed mid-render. Also set by the script.

Disk holds the clips for `KEEP_JOBS_DAYS` (default 7). A 30-second 1080p clip is about 7 MB.

## 2. Create the VM

On the Proxmox node, as root:

```bash
wget https://raw.githubusercontent.com/WatchDog386/cliper-agent/main/deploy/proxmox/create-vm.sh
```

```bash
CORES=8 MEMORY=8192 DISK=150 STORAGE=local-lvm bash create-vm.sh
```

It downloads the Ubuntu 24.04 cloud image, creates the VM with your SSH key (`/root/.ssh/authorized_keys`;
change with `SSH_KEYS=`), starts it and prints the next steps. Other knobs: `VMID`, `BRIDGE`,
`IPCONFIG="ip=192.168.1.50/24,gw=192.168.1.1"` for a fixed address.

Prefer the web UI? Create an Ubuntu 22.04/24.04 VM by hand with CPU type **host**, then continue below.

## 3. Install

On the VM:

```bash
git clone https://github.com/WatchDog386/cliper-agent.git && cd cliper-agent
```

```bash
sudo bash deploy/install.sh
```

```bash
cp deploy/.env.example deploy/.env && nano deploy/.env
```

```bash
bash deploy/deploy.sh
```

`install.sh` adds Docker, the QEMU guest agent, a firewall (SSH, 80, 443 only), swap on small VMs and automatic
security updates. In `deploy/.env` set at least `POSTGRES_PASSWORD`, `JWT_SECRET`, `SITE_ADDRESS` and
`PUBLIC_URL`. Use `deploy.sh` for every update too: it pulls, rebuilds, migrates the database and restarts.

Open the site and create the first account: it becomes the admin. Then set `ALLOW_SIGNUP=false`.

## 4. Make it reachable

Connecting social accounts needs a public **https** address. Two ways:

**A domain and a forwarded port.** Point a DNS record at your public IP, forward ports 80 and 443 on the router
to the VM, and set:

```
SITE_ADDRESS=clips.example.com
PUBLIC_URL=https://clips.example.com
```

Caddy fetches and renews the certificate by itself.

**A Cloudflare Tunnel** (no open ports, works behind CGNAT). In Cloudflare Zero Trust → Networks → Tunnels,
create a tunnel, add a public hostname that points to `http://web:80`, and copy the token:

```
SITE_ADDRESS=:80
PUBLIC_URL=https://clips.example.com
TUNNEL_TOKEN=eyJ…
TRUST_PROXY=2
```

`deploy.sh` starts the tunnel container when `TUNNEL_TOKEN` is set. Cloudflare's free plan limits uploads
through the tunnel to 100 MB per request: paste links for bigger videos, or upload over the LAN address.

## 5. Make it fast

On the CPU alone:

| Setting | What it does | Suggested |
|---|---|---|
| `RENDER_PARALLEL` | Clips of one video rendered side by side | `0` (automatic: 2 on 4 cores, 3 on 8, 4 on 16) |
| `CLIP_CONCURRENCY` | Videos worked on at once | 1 per 4 cores |
| `X264_PRESET` | Encoding effort | `veryfast`; `superfast` is about a third quicker with slightly larger files |
| `X264_CRF` | Quality (lower is better and bigger) | `22` |

Measured on 4 cores, three 30-second 1080×1920 clips with a blurred background: 32 s one at a time, 27 s with
two side by side, 24 s with three.

### With a graphics card

A passed-through GPU encodes several times faster than the CPU. The server tests the encoder when it starts and
falls back to the CPU if the card is not usable, so a wrong setting never breaks rendering. **Settings → Server**
in the app shows which encoder is active.

**Intel (iGPU / Arc) or AMD, through VAAPI**

1. On the Proxmox node, enable IOMMU (`intel_iommu=on` or `amd_iommu=on` on the kernel command line, then
   reboot) and add the graphics device to the VM: **Hardware → Add → PCI Device**, *All functions* on.
2. In the VM, check the card arrived: `ls /dev/dri` should list `renderD128`.
3. In `deploy/.env` set `GPU=vaapi` and run `bash deploy/deploy.sh`.

**NVIDIA, through NVENC**

1. Pass the card through as above (PCI Device, *All functions*, *PCI-Express* on).
2. In the VM, install the NVIDIA driver and the
   [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html),
   then `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`.
   `nvidia-smi` should show the card.
3. In `deploy/.env` set `GPU=nvidia` and run `bash deploy/deploy.sh`.

With `GPU` set, the API is built from `backend/Dockerfile.gpu` (Debian, with the hardware-enabled ffmpeg and
drivers). That image and the two GPU compose files could not be built or run where this was written (no
graphics card there): treat the first deploy as the test, and read the start-up line `✔ encoder …` or the
warning next to it.

## 6. Keep it safe

- **Database**: dumped daily to `deploy/backups` (`BACKUP_KEEP_DAYS`, optional off-site copy in
  `deploy/backup.env.example`). Restore with `bash deploy/restore.sh <file>`.
- **Whole VM**: add it to a Proxmox backup job (Datacenter → Backup). Clips are disposable; exclude the disk
  from frequent backups if space is tight, the database dump is what matters.
- **Secrets**: `deploy/.env` holds the database password, the signing key and the social-app keys. Keep a copy
  somewhere safe; without `TOKEN_ENCRYPTION_KEY` / `JWT_SECRET` the stored social tokens cannot be read and
  every account has to be reconnected.
- **yt-dlp** follows the sites it downloads from, which change often. `bash deploy/deploy.sh` rebuilds the
  image with the newest version; run it when a site stops working.
