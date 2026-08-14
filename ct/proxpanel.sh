#!/usr/bin/env bash
# ProxPanel — Proxmox VE Helper Script
#
# Neuinstallation auf dem Proxmox-Host (als root):
#
#   bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
#
# Update (Code von GitHub holen, bauen, Dienst neu starten):
#
#   Im Container:     proxpanel-update
#   Auf dem Host:     UPDATE=1 bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
#
# Das Script legt einen LXC an und klont die App von GitHub:
#   https://github.com/fantrixx/ProxmoxWebApp

set -eEuo pipefail

APP="ProxPanel"
APP_DIR="/opt/proxpanel"
APP_PORT="3000"
NODE_MAJOR="22"
GITHUB_REPO="fantrixx/ProxmoxWebApp"
REPO_URL="${REPO_URL:-https://github.com/${GITHUB_REPO}.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

YW=$'\033[33m'
GN=$'\033[1;92m'
RD=$'\033[01;31m'
BL=$'\033[36m'
CL=$'\033[m'
BOLD=$'\033[1m'
TAB="  "
CM="${GN}✓${CL}"
CROSS="${RD}✗${CL}"
INFO="${BL}ℹ${CL}"

msg_info() { echo -e "${TAB}${YW}${BOLD}→${CL} $1" >&2; }
msg_ok() { echo -e "${TAB}${CM} ${GN}$1${CL}" >&2; }
msg_error() { echo -e "${TAB}${CROSS} ${RD}$1${CL}" >&2; }
msg_warn() { echo -e "${TAB}${YW}!${CL} $1" >&2; }

header_info() {
  clear
  cat <<'EOF'

  ██████╗ ██████╗  ██████╗ ██╗  ██╗██████╗  █████╗ ███╗   ██╗███████╗██╗
  ██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝██╔══██╗██╔══██╗████╗  ██║██╔════╝██║
  ██████╔╝██████╔╝██║   ██║ ╚███╔╝ ██████╔╝███████║██╔██╗ ██║█████╗  ██║
  ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗ ██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║
  ██║     ██║  ██║╚██████╔╝██╔╝ ██╗██║     ██║  ██║██║ ╚████║███████╗███████╗
  ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝

EOF
  echo -e "${BL}${BOLD}  Proxmox Web-Verwaltung${CL}  ·  LXC Helper Script"
  echo
}

trap 'msg_error "Abbruch in Zeile $LINENO"; exit 1' ERR

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    msg_error "Bitte als root ausführen."
    exit 1
  fi
}

wants_update() {
  local arg
  [[ "${UPDATE:-}" == "1" || "${UPDATE:-}" == "yes" ]] && return 0
  for arg in "$@"; do
    case "$arg" in
      --update | update | -u) return 0 ;;
    esac
  done
  return 1
}

install_update_command() {
  cat > /usr/local/bin/proxpanel-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec bash /opt/proxpanel/ct/proxpanel.sh --update
EOF
  chmod 755 /usr/local/bin/proxpanel-update
}

is_pve_host() { command -v pveversion >/dev/null 2>&1 && command -v pct >/dev/null 2>&1; }

select_from_list() {
  local title="$1" prompt="$2"
  shift 2
  local items=("$@")
  if [[ ${#items[@]} -eq 0 ]]; then
    msg_error "$prompt: keine Einträge."
    exit 1
  fi
  if [[ ${#items[@]} -eq 1 ]]; then
    echo "${items[0]}"
    return
  fi
  local menu=() i=1
  for it in "${items[@]}"; do
    menu+=("$i" "$it")
    ((i++)) || true
  done
  local choice
  choice="$(whiptail --backtitle "$APP" --title "$title" --menu "$prompt" 20 70 10 "${menu[@]}" 3>&1 1>&2 2>&3)" || exit 0
  echo "${items[$((choice - 1))]}"
}

ask() {
  local title="$1" prompt="$2" default="$3"
  local result
  result="$(whiptail --backtitle "$APP" --title "$title" --inputbox "$prompt" 10 70 "$default" 3>&1 1>&2 2>&3)" || exit 0
  echo "$result"
}

yesno() {
  whiptail --backtitle "$APP" --title "$1" --yesno "$2" 10 70
}

next_ctid() {
  pvesh get /cluster/nextid 2>/dev/null || echo 100
}

list_storages() {
  local content="$1"
  pvesm status -content "$content" 2>/dev/null | awk 'NR>1 && $3 ~ /active|online/ {print $1}'
}

list_bridges() {
  local br
  for br in /sys/class/net/vmbr*; do
    [[ -e "$br" ]] && basename "$br"
  done
}

pve_host_ip() {
  local ip
  ip="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)"
  echo "${ip:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
}

ensure_template() {
  local store="$1"
  local arch="amd64"
  case "$(dpkg --print-architecture 2>/dev/null || true)" in
    arm64 | aarch64) arch="arm64" ;;
  esac
  case "$(uname -m)" in
    aarch64 | arm64) arch="arm64" ;;
  esac

  msg_info "Aktualisiere Proxmox-Template-Katalog …"
  pveam update >/dev/null 2>&1 || true

  local tmpl
  tmpl="$(pveam available -section system 2>/dev/null \
    | awk -v arch="$arch" '
        $2 ~ /^debian-12-standard_/ && $2 ~ ("_" arch "\\.tar\\.(zst|xz|gz)$") { print $2 }
      ' \
    | sort -V \
    | tail -1)"

  if [[ -z "$tmpl" || "$tmpl" != debian-12-standard*.tar.* ]]; then
    msg_error "Kein debian-12-standard (${arch}) im Online-Katalog."
    msg_error "Manuell: pveam update && pveam available -section system | grep debian-12"
    exit 1
  fi

  if pveam list "$store" 2>/dev/null | grep -qF "$tmpl"; then
    msg_ok "Template ${tmpl} ist bereits auf ${store}"
  else
    msg_info "Lade ${tmpl} von download.proxmox.com nach ${store} …"
    pveam download "$store" "$tmpl" >&2
    msg_ok "Template heruntergeladen"
  fi

  TEMPLATE="$tmpl"
}

ct_ip() {
  local ctid="$1" ip="" i
  for i in $(seq 1 30); do
    ip="$(pct exec "$ctid" -- bash -lc "ip -4 -o addr show eth0 2>/dev/null | awk '{print \$4}' | cut -d/ -f1" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
    sleep 2
  done
  return 1
}

install_inside_ct() {
  local ctid="$1" pve_ip="$2" repo="$3"

  msg_info "Warte auf Netzwerk im Container …"
  local n
  for n in $(seq 1 30); do
    if pct exec "$ctid" -- bash -lc "ping -c1 -W2 1.1.1.1 >/dev/null 2>&1 || ping -c1 -W2 deb.debian.org >/dev/null 2>&1"; then
      break
    fi
    sleep 2
  done
  msg_ok "Netzwerk bereit"

  msg_info "Installiere Node.js ${NODE_MAJOR}, Git und Build-Werkzeuge …"
  pct exec "$ctid" -- bash -lc "export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
apt-get install -y -qq nodejs
node -v && npm -v"
  msg_ok "Node.js installiert"

  msg_info "Klone ProxPanel von GitHub (${repo} @ ${REPO_BRANCH}) …"
  pct exec "$ctid" -- bash -lc "rm -rf '${APP_DIR}' && git clone --depth 1 --branch '${REPO_BRANCH}' '${repo}' '${APP_DIR}'"
  msg_ok "Quellcode liegt in ${APP_DIR}"

  msg_info "Installiere npm-Abhängigkeiten und baue die App …"
  pct exec "$ctid" -- bash -lc "cd '${APP_DIR}' && npm install && npm run build"
  msg_ok "Build fertig"

  msg_info "Schreibe Konfiguration und systemd-Dienst …"
  pct exec "$ctid" -- bash -lc "cat > '${APP_DIR}/.env' <<EOF
PORT=${APP_PORT}
PROXMOX_URL=https://${pve_ip}:8006
PROXMOX_INSECURE_TLS=true
EOF"

  pct exec "$ctid" -- bash -lc "cat > /etc/systemd/system/proxpanel.service <<'EOF'
[Unit]
Description=ProxPanel — Proxmox Web Administration
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/proxpanel
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=-/opt/proxpanel/.env
ExecStart=/usr/bin/npx tsx server/index.ts
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now proxpanel
cat > /usr/local/bin/proxpanel-update <<'UPEOF'
#!/usr/bin/env bash
set -euo pipefail
exec bash /opt/proxpanel/ct/proxpanel.sh --update
UPEOF
chmod 755 /usr/local/bin/proxpanel-update"

  pct exec "$ctid" -- bash -lc "cat > /etc/motd <<EOF

ProxPanel  →  http://\$(hostname -I | awk '{print \$1}'):${APP_PORT}
Update:     proxpanel-update
Dienst:     systemctl status proxpanel
Logs:       journalctl -u proxpanel -f
Quelle:     ${APP_DIR}

EOF"
  msg_ok "Dienst proxpanel ist aktiv"
}

find_proxpanel_cts() {
  local id status name
  while read -r id status name; do
    [[ -z "$id" ]] && continue
    if [[ "$status" == "running" ]] && pct exec "$id" -- test -d "$APP_DIR" 2>/dev/null; then
      echo "$id"
      continue
    fi
    if pct config "$id" 2>/dev/null | grep -qE '^hostname:[[:space:]]*proxpanel'; then
      echo "$id"
    fi
  done < <(pct list | awk 'NR>1 {print $1, $2, $NF}')
}

update_inside_ct() {
  header_info
  need_root
  if [[ ! -d "$APP_DIR" ]]; then
    msg_error "Keine ProxPanel-Installation unter ${APP_DIR} gefunden."
    exit 1
  fi

  local branch="${REPO_BRANCH:-main}"
  msg_info "Hole aktuellen Stand von GitHub (${branch}) …"
  cd "$APP_DIR"
  if [[ -d .git ]]; then
    git remote set-url origin "$REPO_URL" >/dev/null 2>&1 || true
    git fetch --depth 1 origin "$branch"
    git checkout -B "$branch" "origin/$branch"
    git reset --hard "origin/$branch"
    msg_ok "Stand: $(git log -1 --pretty=format:'%h %s')"
  else
    msg_warn "Kein Git-Repo — nur npm-Build. Für Code-Updates das Helper-Script vom Host mit UPDATE=1 ausführen."
  fi

  msg_info "Installiere Abhängigkeiten und baue die App …"
  npm install
  npm run build
  msg_ok "Build fertig"

  install_update_command
  systemctl daemon-reload
  systemctl restart proxpanel
  sleep 1
  if systemctl is-active --quiet proxpanel; then
    msg_ok "Update fertig. http://$(hostname -I | awk '{print $1}'):${APP_PORT}"
    echo
    echo -e "${TAB}${INFO}  Nächstes Update: ${GN}proxpanel-update${CL}"
  else
    msg_error "Dienst proxpanel ist nicht aktiv. Logs: journalctl -u proxpanel -e"
    exit 1
  fi
  exit 0
}

update_from_pve_host() {
  header_info
  need_root

  local cts=()
  mapfile -t cts < <(find_proxpanel_cts | awk 'NF && !seen[$0]++')
  if [[ ${#cts[@]} -eq 0 ]]; then
    msg_error "Kein ProxPanel-Container gefunden (Ordner ${APP_DIR} oder Hostname proxpanel)."
    exit 1
  fi

  local ctid="${cts[0]}"
  if [[ ${#cts[@]} -gt 1 ]]; then
    ctid="$(select_from_list "Update" "Welchen ProxPanel-Container aktualisieren?" "${cts[@]}")"
  fi

  local status
  status="$(pct status "$ctid" 2>/dev/null | awk '{print $2}')"
  if [[ "$status" != "running" ]]; then
    msg_info "Starte Container ${ctid} …"
    pct start "$ctid"
    sleep 3
  fi
  msg_ok "Aktualisiere Container ${ctid}"

  local script_url="https://raw.githubusercontent.com/${GITHUB_REPO}/${REPO_BRANCH}/ct/proxpanel.sh"
  pct exec "$ctid" -- bash -lc "wget -qO /tmp/proxpanel.sh '${script_url}' && bash /tmp/proxpanel.sh --update && rm -f /tmp/proxpanel.sh"
}

create_container() {
  header_info
  need_root

  if ! is_pve_host; then
    msg_error "Dieses Script muss auf einem Proxmox-VE-Host laufen (pct/pveversion fehlen)."
    exit 1
  fi

  msg_ok "Beziehe App und Abhängigkeiten von GitHub: ${REPO_URL} (${REPO_BRANCH})"

  local CTID HN CPU RAM DISK BRG STORAGE TPL_STORAGE NET PW MODE
  CTID="$(next_ctid)"
  HN="proxpanel"
  CPU="2"
  RAM="2048"
  DISK="8"
  PW=""
  NET="dhcp"

  local storages=()
  mapfile -t storages < <(list_storages rootdir)
  STORAGE="${storages[0]:-local-lvm}"

  local templates=()
  mapfile -t templates < <(list_storages vztmpl)
  TPL_STORAGE="${templates[0]:-local}"

  local bridges=()
  mapfile -t bridges < <(list_bridges)
  BRG="${bridges[0]:-vmbr0}"

  MODE="1"
  if [[ -t 0 && "${DEFAULTS:-}" != "yes" ]]; then
    MODE="$(whiptail --backtitle "$APP" --title "$APP LXC" --menu "Einstellungen" 14 70 2 \
      "1" "Standard (Debian 12, DHCP, 2 CPU / 2 GiB / 8 GiB)" \
      "2" "Erweitert" 3>&1 1>&2 2>&3 || true)"
    [[ -z "$MODE" ]] && exit 0
  fi

  if [[ "$MODE" == "2" ]]; then
    CTID="$(ask "CTID" "Container-ID" "$CTID")"
    HN="$(ask "Hostname" "Hostname" "$HN")"
    CPU="$(ask "CPU" "CPU-Kerne" "$CPU")"
    RAM="$(ask "RAM" "Arbeitsspeicher in MiB" "$RAM")"
    DISK="$(ask "Disk" "Festplatte in GiB" "$DISK")"
    STORAGE="$(select_from_list "Storage" "Container-Storage (rootfs)" "${storages[@]}")"
    TPL_STORAGE="$(select_from_list "Template-Storage" "Storage für LXC-Templates" "${templates[@]}")"
    BRG="$(select_from_list "Bridge" "Netzwerk-Bridge" "${bridges[@]}")"
    if yesno "Netzwerk" "DHCP verwenden?\n(Nein = statische IPv4)"; then
      NET="dhcp"
    else
      local staticip gw
      staticip="$(ask "IP" "IPv4 mit Prefix, z.B. 192.168.1.50/24" "192.168.1.50/24")"
      gw="$(ask "Gateway" "Gateway" "192.168.1.1")"
      NET="ip=${staticip},gw=${gw}"
    fi
    PW="$(ask "Passwort" "root-Passwort (leer = zufällig)" "")"
  else
    STORAGE="$(select_from_list "Storage" "Container-Storage" "${storages[@]}")"
    if [[ ${#templates[@]} -gt 1 ]]; then
      TPL_STORAGE="$(select_from_list "Template-Storage" "Storage für Templates" "${templates[@]}")"
    fi
    if [[ ${#bridges[@]} -gt 1 ]]; then
      BRG="$(select_from_list "Bridge" "Netzwerk-Bridge" "${bridges[@]}")"
    fi
  fi

  if pct status "$CTID" >/dev/null 2>&1; then
    msg_error "CT ${CTID} existiert bereits."
    exit 1
  fi

  if [[ -z "$PW" ]]; then
    PW="$(openssl rand -base64 12 | tr -d '/+=' | head -c 16)"
    PW_GENERATED=1
  else
    PW_GENERATED=0
  fi

  TEMPLATE=""
  ensure_template "$TPL_STORAGE"
  msg_ok "Template: ${TEMPLATE}"

  msg_info "Erstelle LXC ${CTID} (${HN}) …"
  local net0="name=eth0,bridge=${BRG}"
  if [[ "$NET" == "dhcp" ]]; then
    net0+=",ip=dhcp"
  else
    net0+=",${NET}"
  fi

  pct create "$CTID" "${TPL_STORAGE}:vztmpl/${TEMPLATE}" \
    --hostname "$HN" \
    --cores "$CPU" \
    --memory "$RAM" \
    --swap 512 \
    --rootfs "${STORAGE}:${DISK}" \
    --net0 "$net0" \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --password "$PW" \
    --description "ProxPanel - Proxmox Web-Verwaltung" \
    --start 0
  msg_ok "Container ${CTID} angelegt"

  msg_info "Starte Container …"
  pct start "$CTID"
  sleep 4
  msg_ok "Container läuft"

  local PVE_IP
  PVE_IP="$(pve_host_ip)"
  install_inside_ct "$CTID" "$PVE_IP" "$REPO_URL"

  local IP
  IP="$(ct_ip "$CTID" || true)"
  [[ -z "$IP" ]] && IP="(DHCP-IP in der PVE-UI prüfen)"

  pct set "$CTID" --description "ProxPanel - http://${IP}:${APP_PORT}"

  echo
  msg_ok "ProxPanel ist installiert"
  echo
  echo -e "${TAB}${INFO}  URL:          ${GN}http://${IP}:${APP_PORT}${CL}"
  echo -e "${TAB}${INFO}  Container:    ${GN}${CTID}${CL} (${HN})"
  echo -e "${TAB}${INFO}  Proxmox-API:  ${GN}https://${PVE_IP}:8006${CL}  (in .env hinterlegt)"
  if [[ "$PW_GENERATED" == "1" ]]; then
    echo -e "${TAB}${INFO}  root-Passwort:${GN} ${PW}${CL}"
  fi
  echo -e "${TAB}${INFO}  Im Browser anmelden mit deinem Proxmox-Benutzer (z. B. root@pam)."
  echo -e "${TAB}${INFO}  Update im CT:  ${GN}proxpanel-update${CL}"
  echo -e "${TAB}${INFO}  Update am Host:${GN} UPDATE=1 bash -c \"\$(wget -qLO - https://raw.githubusercontent.com/${GITHUB_REPO}/main/ct/proxpanel.sh)\"${CL}"
  echo
}

if wants_update "$@"; then
  if is_pve_host; then
    update_from_pve_host
  else
    update_inside_ct
  fi
elif is_pve_host; then
  create_container
else
  update_inside_ct
fi
