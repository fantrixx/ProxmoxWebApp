# ProxPanel Android

Native Android client for [ProxPanel](https://github.com/fantrixx/ProxmoxWebApp) — manage Proxmox VE containers and VMs from your phone.

**Version:** 1.0.0

## What it does

- Sign in against your **ProxPanel** server (same session API as the web UI)
- Browse CTs / VMs with live CPU & RAM
- Filter, search, pull-to-refresh
- Guest detail: metrics, copy/open IP, start / shut down / reboot / force stop
- Android Autofill / 1Password friendly login fields
- Works with HTTP LAN installs and self-signed TLS (optional verify toggle)

## Requirements

- Android 8.0+ (API 26)
- A running ProxPanel instance (e.g. `http://<ct-ip>:3000`)
- Android Studio Ladybug+ (or compatible) to build

## Build

```bash
./gradlew :app:assembleDebug
```

Install the APK from `app/build/outputs/apk/debug/`.

Or open this folder in Android Studio → Run.

## Sign-in fields

| Field | Meaning |
|-------|---------|
| **ProxPanel URL** | Your ProxPanel web app, e.g. `http://192.168.1.50:3000` |
| **Proxmox server** | The Proxmox API URL ProxPanel should use, e.g. `https://192.168.1.10:8006` |
| **Username / password / realm** | Same as the ProxPanel web login |

The app talks only to ProxPanel’s `/api/*` endpoints (cookie session), not to Proxmox directly.

## Feature sync with the web app

This is a **separate native frontend**. New ProxPanel web features need a matching Android screen/API call here. Shared contract = ProxPanel HTTP API.

## License

Same spirit as ProxPanel — personal / homelab use. Not affiliated with Proxmox Server Solutions GmbH.
