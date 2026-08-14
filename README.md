# ProxPanel

Web-Oberfläche zur Verwaltung eines Proxmox-VE-Servers: Container und VMs anzeigen, starten, stoppen und per Shell bedienen.

## Installation als LXC (Proxmox Helper Script)

Auf dem **Proxmox-Host** als root (nicht im Container):

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

Das Script legt einen Debian-12-LXC an, klont [dieses Repo](https://github.com/fantrixx/ProxmoxWebApp), installiert Node.js und npm-Abhängigkeiten, baut die App und startet den Dienst.

Danach: `http://<CT-IP>:3000` — anmelden mit dem Proxmox-Benutzer (z. B. `root@pam`).

Ohne Rückfragen: `DEFAULTS=yes bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"`

## Update

Holt den aktuellen Stand von GitHub, baut die App und startet den Dienst neu (`.env` bleibt erhalten).

**Im Container** (nach `pct enter <CTID>` oder SSH):

```bash
proxpanel-update
```

Falls der Befehl noch fehlt (ältere Installation), einmalig dasselbe Script **im CT** ausführen:

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

**Auf dem Proxmox-Host** (findet den ProxPanel-LXC selbst):

```bash
UPDATE=1 bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
```

## Funktionen

- Anmeldung am Proxmox-Server (Benutzer/Passwort oder API-Token)
- Live-Metriken: CPU, RAM, Festplatte, Netzwerk, Uptime
- LXC-Container und QEMU-VMs starten, herunterfahren, stoppen, neu starten
- Interaktive Shell (xterm.js über WebSocket-Proxy)
- Snapshots, Ressourcen anpassen, IP-Anzeige
- Node- und Speicherübersicht

## Voraussetzungen (lokale Entwicklung)

- Node.js 20 oder neuer
- Erreichbarer Proxmox-VE-Server (Port 8006)

## Starten (Entwicklung)

```bash
npm install
npm run dev
```

Die Oberfläche läuft unter [http://localhost:5173](http://localhost:5173).

Produktion:

```bash
npm run build
npm start
```

Dann: [http://localhost:3000](http://localhost:3000).

## Verbindung

Auf der Login-Seite Server-URL, Benutzer, Realm und Passwort eintragen. Proxmox nutzt oft ein Self-Signed-Zertifikat — **TLS-Zertifikat prüfen** dann ausgeschaltet lassen.

Optional `.env` (siehe `.env.example`):

```
PROXMOX_URL=https://192.168.1.10:8006
PROXMOX_USER=root
PROXMOX_REALM=pam
PROXMOX_TOKEN_ID=root@pam!proxpanel
PROXMOX_TOKEN_SECRET=...
```

API-Token in Proxmox: Datacenter → Permissions → API Tokens. Der Token braucht Rechte auf `/` (z. B. Administrator oder ein eigenes Role-Set mit VM.Audit, VM.PowerMgmt, VM.Console).
