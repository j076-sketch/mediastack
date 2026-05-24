# Home Media Stack

A self-hosted home media server stack running in Docker Compose.

## What's included

| Service | Purpose | Port |
|---|---|---|
| **Caddy** | Reverse proxy + internal HTTPS (`*.lan`) | 80, 443 |
| **Jellyfin** | Open-source media server | 8096 |
| **Plex** | Alternative media server (optional) | 32400 |
| **Sonarr** | TV show management + automation | 8989 |
| **Radarr** | Movie management + automation | 7878 |
| **Prowlarr** | Indexer manager (routes via VPN) | 9696 |
| **FlareSolverr** | Cloudflare challenge bypass | 8191 |
| **Bazarr** | Subtitle management | 6767 |
| **Seerr** | Media request portal | 5055 |
| **Gluetun** | VPN container (PIA, Mullvad, etc.) | — |
| **TubeArchivist** | YouTube channel archiver | 8000 |
| **Elasticsearch** | Search backend for TubeArchivist | 9200 |
| **Redis** | Cache backend for TubeArchivist | — |

---

## Prerequisites

- Linux host (Ubuntu 22.04+ recommended) with Docker + Docker Compose v2
- A VPN subscription (PIA, Mullvad, AirVPN, etc. — [Gluetun supports many providers](https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers))
- Plex Pass account if you want Plex hardware transcoding (optional — Jellyfin is free)
- Intel GPU for hardware transcoding (optional — CPU transcoding works without it)

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/mediastack.git
cd mediastack
```

### 2. Create your environment file

```bash
cp .env.example .env
nano .env   # fill in all values
```

Key values to set:
- `HOST_IP` — your server's LAN IP (e.g. `192.168.1.50`)
- `MEDIA_DOWNLOADS` — path where downloads land (e.g. `/mnt/media/downloads`)
- `MEDIA_LIBRARY` — path for your organized media (e.g. `/mnt/media/library`)
- `TZ` — your timezone (e.g. `America/New_York`)
- `PLEX_CLAIM` — get from https://plex.tv/claim (**expires 4 minutes after generation**)
- `OPENVPN_USER` / `OPENVPN_PASSWORD` — your VPN credentials
- `ELASTIC_PASSWORD`, `TA_PASSWORD`, `TA_SECRET_KEY` — set strong passwords

Generate `TA_SECRET_KEY`:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Create media directories

```bash
mkdir -p /mnt/media/downloads /mnt/media/library
# adjust paths to match what you set in .env
```

### 4. Start the stack

```bash
docker compose up -d
```

Check logs:
```bash
docker compose logs -f
```

---

## DNS Setup (*.lan subdomains)

This stack uses Caddy to serve all services over HTTPS on `.lan` subdomains. You need two things:

### A. Point *.lan at your server

Add entries to your router's DNS or `/etc/hosts` on each client machine:

```
192.168.1.YOUR_SERVER_IP  jellyfin.lan
192.168.1.YOUR_SERVER_IP  plex.lan
192.168.1.YOUR_SERVER_IP  sonarr.lan
192.168.1.YOUR_SERVER_IP  radarr.lan
192.168.1.YOUR_SERVER_IP  prowlarr.lan
192.168.1.YOUR_SERVER_IP  bazarr.lan
192.168.1.YOUR_SERVER_IP  seerr.lan
192.168.1.YOUR_SERVER_IP  tubearchivist.lan
```

**Better option:** Use Pi-hole, AdGuard Home, or your router's DNS server with a wildcard `*.lan → your server IP`. Then all subdomains resolve automatically.

### B. Trust Caddy's internal CA

Caddy signs its own certs using a local CA. Browsers will show "Not Secure" until you trust the CA cert.

1. Enable the Caddy admin API — in `docker-compose.yml` uncomment `- "2019:2019"` under caddy ports, restart
2. Export the CA cert:
   ```bash
   curl http://YOUR_SERVER_IP:2019/pki/ca/local/certificates > caddy-root-ca.crt
   ```
3. Import `caddy-root-ca.crt` into your browser/OS trust store:
   - **Chrome/Windows:** double-click the `.crt` → install to "Trusted Root Certification Authorities"
   - **Firefox:** Settings → Privacy → View Certificates → Authorities → Import
   - **macOS:** double-click → Keychain → mark as Always Trust
4. Re-disable the admin port after exporting (uncomment `# - "2019:2019"` again, restart)

---

## GPU Hardware Transcoding (Intel)

The compose file assumes an Intel GPU at `/dev/dri`. If you don't have one, remove these blocks from both `jellyfin` and `plex`:

```yaml
devices:
  - /dev/dri:/dev/dri
group_add:
  - "44"
  - "992"
```

For Jellyfin hardware transcoding setup: Dashboard → Playback → Hardware Acceleration → Intel QuickSync / VAAPI.

> **Note on `group_add`:** The render group GID (`992`) may differ on your system. Check with:
> ```bash
> getent group render
> ```
> Update the value in `docker-compose.yml` to match.

---

## Running Inside Proxmox LXC

If you're running Docker inside a Proxmox LXC container, use the AppArmor override:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

Or just place `docker-compose.override.yml` in the same folder — Docker Compose merges it automatically.

The LXC also needs these features enabled in Proxmox (edit via GUI or `/etc/pve/lxc/VMID.conf`):
```
features: fuse=1,keyctl=1,nesting=1
```

---

## Connecting the *arr stack

After everything is running, connect the services:

1. **Prowlarr → Sonarr/Radarr:** Prowlarr Settings → Apps → Add Sonarr/Radarr
2. **Sonarr/Radarr → qBittorrent:** Settings → Download Clients → Add qBittorrent
3. **Seerr → Jellyfin/Sonarr/Radarr:** Follow the Seerr setup wizard at `seerr.lan`

---

## Updating

```bash
docker compose pull
docker compose up -d
```

---

## Removing TubeArchivist

If you don't want the YouTube archiver, remove these services from `docker-compose.yml`:
- `tubearchivist`
- `elasticsearch`
- `redis`

And remove the corresponding variables from `.env`.

---

## VPN Provider

This stack uses [Gluetun](https://github.com/qdm12/gluetun) for VPN. PIA is the default, but Gluetun supports many providers. To switch, update `VPN_PROVIDER` in `.env` and adjust `OPENVPN_USER`/`OPENVPN_PASSWORD` to match your provider's credential format.

See the [Gluetun provider docs](https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers) for provider-specific config.
