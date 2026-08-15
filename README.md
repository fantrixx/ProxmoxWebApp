# ProxPanel

**A focused web UI for Proxmox VE** — manage containers and VMs from any browser, including your phone.

[![Version](https://img.shields.io/badge/version-1.3.31-orange?style=flat-square)](./package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square)](https://nodejs.org/)
[![Proxmox](https://img.shields.io/badge/Proxmox%20VE-API-E57000?style=flat-square)](https://www.proxmox.com/)

Install as an LXC on your Proxmox host in one command, sign in with your Proxmox credentials, and control guests without opening the full Proxmox UI.

---

## Install (Proxmox helper script)

Run as **root on the Proxmox host** (not inside a container):

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

The script creates a Debian 12 LXC, clones this repo, installs Node.js, builds ProxPanel, and starts the service.

| Mode | What you get |
|------|----------------|
| **Default** | Debian 12 · DHCP · 2 CPU / 2 GiB RAM / 8 GiB disk · port `3000` |
| **Custom** | CTID, CPU/RAM/disk, network, VLAN, DNS, SSH, port, Proxmox API URL, TLS, token, and more — with a summary before create |

Open: `http://<CT-IP>:3000` and sign in (e.g. `root@pam`).

Non-interactive install:

```bash
DEFAULTS=yes bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

---

## Update

Keeps your `.env` and restarts the service after pulling the latest release from GitHub.

If install, build, or service restart fails after the code has already moved forward, the updater **rolls back** to the previous working commit (saved tag + git bundle), restores the previous `dist` when possible, and restarts the service again.

**Inside the container** (`pct enter <CTID>` or SSH):

```bash
proxpanel-update
```

**On the Proxmox host** (finds the ProxPanel CT automatically):

```bash
UPDATE=1 bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

If `proxpanel-update` is missing on an older install, run the helper script once **inside** the CT:

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

The UI also checks GitHub for newer versions and shows an update banner on login and overview pages. When signed in, use **Update now** on the banner to run the same update from the UI (pull, rebuild, restart, with automatic rollback on failure).

---

## Features

### Guests
- Live CPU, RAM, disk, network, and uptime on every card
- Start, shut down, and restart from the overview
- Force stop available on the guest detail page
- Interactive shell (xterm.js over WebSocket)
- IP overview with quick copy

### Backups & jobs
- Cluster-wide backup overview (last backup per guest: when, format, size, location)
- Start backups from any guest card with storage, mode, and compression options
- Past backups per guest, filtered by storage
- Active job progress under the header (multi-job aware)
- Progress feedback on the guest card while a backup runs

### Schedules
- Plan start / shut down / stop / backup per guest
- Backup schedules support storage, mode (snapshot recommended), and compression
- Create, edit, pause, and delete from a dedicated dialog
- Scrollable schedule list with last-run time
- Survives reboot when you configure an API token in `.env` (required for schedules to run)

### More
- Snapshots and resource tuning
- Cluster task list with readable titles
- ISO / template media library and VM CD/DVD attach
- Node and storage overview
- Mobile-friendly layout (touch targets, bottom sheets, safe areas)

---

## Versioning

App version comes from `package.json` (currently **1.3.31**). It appears on the login screen and in the signed-in UI. On load, ProxPanel compares against GitHub and can show an update banner.

---

## Local development

**Requirements:** Node.js 20+ and a reachable Proxmox VE host (API on port `8006`).

```bash
npm install
npm run dev
```

→ [http://localhost:5173](http://localhost:5173)

Production build:

```bash
npm run build
npm start
```

→ [http://localhost:3000](http://localhost:3000)

---

## Connection & `.env`

On the login page, enter server URL, user, realm, and password. For the common self-signed Proxmox certificate, leave **Verify TLS certificate** disabled.

Optional defaults via `.env` (see `.env.example`):

```env
PROXMOX_URL=https://192.168.1.10:8006
PROXMOX_USER=root
PROXMOX_REALM=pam
PROXMOX_TOKEN_ID=root@pam!proxpanel
PROXMOX_TOKEN_SECRET=...
```

Create an API token in Proxmox: **Datacenter → Permissions → API Tokens**. The token needs access on `/` (e.g. Administrator, or a role with at least `VM.Audit`, `VM.PowerMgmt`, `VM.Console`, plus backup-related privileges if you use backups).

> **Schedules:** ProxPanel must keep running, and an API token in `.env` (`PROXMOX_URL`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`) is **required** for schedules to run. Interactive browser sessions are not used for automation.

---

## Links

- Repository: [github.com/fantrixx/ProxmoxWebApp](https://github.com/fantrixx/ProxmoxWebApp)
- Install script: [`ct/proxpanel.sh`](./ct/proxpanel.sh)

---

<p align="center">
  <sub>Built for homelabs and small Proxmox clusters · Not affiliated with Proxmox Server Solutions GmbH</sub>
</p>
