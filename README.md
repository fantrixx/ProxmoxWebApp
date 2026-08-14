# ProxPanel

Web interface for managing a Proxmox VE server: view, start, stop, and shell into containers and VMs.

## Installation as LXC (Proxmox Helper Script)

On the **Proxmox host** as root (not inside a container):

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

The script creates a Debian 12 LXC, clones [this repo](https://github.com/fantrixx/ProxmoxWebApp), installs Node.js and npm dependencies, builds the app, and starts the service.

On startup you can choose:

- **Default** — as before: Debian 12, DHCP, 2 CPU / 2 GiB RAM / 8 GiB disk, port 3000
- **Custom** — CTID, CPU/RAM/disk/swap, storage, bridge, DHCP or static IP, VLAN, DNS, IPv6, root password, SSH, autostart, deletion protection, privileged/unprivileged, timezone, tags, web port, Proxmox API URL, TLS, optional user/token. A summary appears before creation.

Then: `http://<CT-IP>:3000` (or the chosen port) — sign in with your Proxmox user (e.g. `root@pam`).

Without prompts: `DEFAULTS=yes bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"`

## Update

Fetches the latest code from GitHub, builds the app, and restarts the service (`.env` is preserved).

On shell login in the container, a hint about `proxpanel-update` is shown. The web interface checks on the login and overview pages whether a newer version exists on GitHub and displays an update hint with the update command.

**Inside the container** (after `pct enter <CTID>` or SSH):

```bash
proxpanel-update
```

If the command is not yet available (older installation), run the same script **inside the CT** once:

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

**On the Proxmox host** (finds the ProxPanel LXC automatically):

```bash
UPDATE=1 bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

## Versioning

The app version comes from `version` in `package.json` (currently **1.2.0**). It is shown on the login screen and in the UI after sign-in (header badge and sidebar). Git commit comparison against GitHub is used separately to detect available updates.

## Features

- Sign in to the Proxmox server (username/password or API token)
- Live metrics: CPU, RAM, disk, network, uptime
- Start, shut down, stop, and restart LXC containers and QEMU VMs
- Interactive shell (xterm.js via WebSocket proxy)
- Snapshots, resource adjustment, IP display
- Node and storage overview

## Requirements (local development)

- Node.js 20 or newer
- Reachable Proxmox VE server (port 8006)

## Running (development)

```bash
npm install
npm run dev
```

The interface runs at [http://localhost:5173](http://localhost:5173).

Production:

```bash
npm run build
npm start
```

Then: [http://localhost:3000](http://localhost:3000).

## Connection

On the login page, enter server URL, user, realm, and password. Proxmox often uses a self-signed certificate — leave **Verify TLS certificate** disabled in that case.

Optional `.env` (see `.env.example`):

```
PROXMOX_URL=https://192.168.1.10:8006
PROXMOX_USER=root
PROXMOX_REALM=pam
PROXMOX_TOKEN_ID=root@pam!proxpanel
PROXMOX_TOKEN_SECRET=...
```

API token in Proxmox: Datacenter → Permissions → API Tokens. The token needs permissions on `/` (e.g. Administrator or a custom role set with VM.Audit, VM.PowerMgmt, VM.Console).
