#!/usr/bin/env bash
# ProxPanel — Proxmox VE Helper Script
#
# Neuinstallation auf dem Proxmox-Host (als root):
#
#   bash -c "$(wget -qLO - https://raw.githubusercontent.com/fantrixx/ProxmoxWebApp/main/ct/proxpanel.sh)"
#
# Danach: Standard (wie bisher) oder Custom (CPU, Netz, Port, Proxmox-API, SSH, …).
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

  cat > /etc/profile.d/proxpanel.sh <<'EOF'
# ProxPanel shell banner (interactive logins only)
if [[ $- == *i* ]]; then
  echo
  echo "  ProxPanel — Update mit:  proxpanel-update"
  echo "  Dienst: systemctl status proxpanel  ·  Logs: journalctl -u proxpanel -f"
  echo
fi
EOF
  chmod 644 /etc/profile.d/proxpanel.sh

  local port="${APP_PORT:-3000}"
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  cat > /etc/motd <<EOF

ProxPanel  →  http://${ip:-<CT-IP>}:${port}
────────────────────────────────────────────────────────
Update:     proxpanel-update
Dienst:     systemctl status proxpanel
Logs:       journalctl -u proxpanel -f
Quelle:     /opt/proxpanel
────────────────────────────────────────────────────────

EOF
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
  local title="$1" prompt="$2"
  shift 2
  whiptail --backtitle "$APP" --title "$title" "$@" --yesno "$prompt" 12 72
}

info_box() {
  whiptail --backtitle "$APP" --title "$1" --msgbox "$2" 12 72
}

ask_secret() {
  local result
  result="$(whiptail --backtitle "$APP" --title "$1" --passwordbox "$2" 10 70 3>&1 1>&2 2>&3)" || exit 0
  echo "$result"
}

ask_int() {
  local title="$1" prompt="$2" default="$3" min="$4" max="$5" val
  while true; do
    val="$(ask "$title" "$prompt" "$default")"
    if [[ "$val" =~ ^[0-9]+$ ]] && ((val >= min && val <= max)); then
      echo "$val"
      return
    fi
    info_box "$title" "Bitte eine Zahl zwischen ${min} und ${max} eingeben."
  done
}

yn_de() { [[ "${1:-}" == "1" ]] && echo "ja" || echo "nein"; }

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
  local ctid="$1"

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

  if [[ "${CT_SSH:-0}" == "1" ]]; then
    msg_info "Aktiviere SSH-Zugang für root …"
    pct exec "$ctid" -- bash -lc 'export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq openssh-server
sed -i "s/^#\\?PermitRootLogin.*/PermitRootLogin yes/" /etc/ssh/sshd_config
systemctl enable --now ssh'
    msg_ok "SSH ist aktiv (root-Login)"
  fi

  if [[ -n "${CT_TIMEZONE:-}" ]]; then
    msg_info "Setze Zeitzone ${CT_TIMEZONE} …"
    pct exec "$ctid" -- bash -lc "timedatectl set-timezone '${CT_TIMEZONE}' 2>/dev/null || {
      echo '${CT_TIMEZONE}' > /etc/timezone
      ln -sfn '/usr/share/zoneinfo/${CT_TIMEZONE}' /etc/localtime
    }"
    msg_ok "Zeitzone ${CT_TIMEZONE}"
  fi

  if [[ "${CT_IPV6:-1}" != "1" ]]; then
    pct exec "$ctid" -- bash -lc 'printf "%s\n" "net.ipv6.conf.all.disable_ipv6=1" "net.ipv6.conf.default.disable_ipv6=1" > /etc/sysctl.d/99-disable-ipv6.conf
sysctl -p /etc/sysctl.d/99-disable-ipv6.conf >/dev/null 2>&1 || true'
  fi

  msg_info "Klone ProxPanel von GitHub (${REPO_URL} @ ${REPO_BRANCH}) …"
  pct exec "$ctid" -- bash -lc "rm -rf '${APP_DIR}' && git clone --depth 1 --branch '${REPO_BRANCH}' '${REPO_URL}' '${APP_DIR}'"
  msg_ok "Quellcode liegt in ${APP_DIR}"

  msg_info "Installiere npm-Abhängigkeiten und baue die App …"
  pct exec "$ctid" -- bash -lc "cd '${APP_DIR}' && npm install && npm run build"
  msg_ok "Build fertig"

  msg_info "Schreibe Konfiguration und systemd-Dienst …"
  local envtmp old_umask
  envtmp="$(mktemp)"
  old_umask="$(umask)"
  umask 077
  {
    printf 'PORT=%s\n' "${APP_PORT}"
    printf 'PROXMOX_URL=%s\n' "${PVE_URL}"
    printf 'PROXMOX_INSECURE_TLS=%s\n' "${PROXMOX_INSECURE}"
    if [[ -n "${PROXMOX_USER_CFG:-}" ]]; then
      printf 'PROXMOX_USER=%s\n' "${PROXMOX_USER_CFG}"
    fi
    if [[ -n "${PROXMOX_REALM_CFG:-}" ]]; then
      printf 'PROXMOX_REALM=%s\n' "${PROXMOX_REALM_CFG}"
    fi
    if [[ -n "${PROXMOX_TOKEN_ID_CFG:-}" ]]; then
      printf 'PROXMOX_TOKEN_ID=%s\n' "${PROXMOX_TOKEN_ID_CFG}"
    fi
    if [[ -n "${PROXMOX_TOKEN_SECRET_CFG:-}" ]]; then
      printf 'PROXMOX_TOKEN_SECRET=%s\n' "${PROXMOX_TOKEN_SECRET_CFG}"
    fi
  } > "$envtmp"
  umask "$old_umask"
  pct push "$ctid" "$envtmp" "${APP_DIR}/.env"
  rm -f "$envtmp"
  pct exec "$ctid" -- chmod 600 "${APP_DIR}/.env"

  pct exec "$ctid" -- bash -lc "cat > /etc/systemd/system/proxpanel.service <<'EOF'
[Unit]
Description=ProxPanel — Proxmox Web Administration
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/proxpanel
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
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
chmod 755 /usr/local/bin/proxpanel-update
cat > /etc/profile.d/proxpanel.sh <<'UPEOF'
# ProxPanel shell banner (interactive logins only)
if [[ \$- == *i* ]]; then
  echo
  echo \"  ProxPanel — Update mit:  proxpanel-update\"
  echo \"  Dienst: systemctl status proxpanel  ·  Logs: journalctl -u proxpanel -f\"
  echo
fi
UPEOF
chmod 644 /etc/profile.d/proxpanel.sh
cat > /etc/motd <<EOF

ProxPanel  →  http://\$(hostname -I 2>/dev/null | awk '{print \$1}'):${APP_PORT}
────────────────────────────────────────────────────────
Update:     proxpanel-update
Dienst:     systemctl status proxpanel
Logs:       journalctl -u proxpanel -f
Quelle:     ${APP_DIR}
────────────────────────────────────────────────────────

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

collect_custom_settings() {
  CTID="$(ask_int "CTID" "Container-ID" "$CTID" 100 999999999)"
  HN="$(ask "Hostname" "Hostname des Containers" "$HN")"
  [[ -z "$HN" ]] && HN="proxpanel"
  CPU="$(ask_int "CPU" "CPU-Kerne" "$CPU" 1 128)"
  RAM="$(ask_int "RAM" "Arbeitsspeicher in MiB" "$RAM" 512 524288)"
  DISK="$(ask_int "Disk" "Festplatte in GiB" "$DISK" 4 1024)"
  CT_SWAP="$(ask_int "Swap" "Swap in MiB" "$CT_SWAP" 0 65536)"

  STORAGE="$(select_from_list "Storage" "Container-Storage (rootfs)" "${storages[@]}")"
  TPL_STORAGE="$(select_from_list "Template-Storage" "Storage für LXC-Templates" "${templates[@]}")"
  BRG="$(select_from_list "Bridge" "Netzwerk-Bridge" "${bridges[@]}")"

  if yesno "Netzwerk" "DHCP verwenden?\n(Nein = statische IPv4)"; then
    NET="dhcp"
    STATIC_IP=""
    GATEWAY=""
  else
    STATIC_IP="$(ask "IP" "IPv4 mit Prefix, z. B. 192.168.1.50/24" "${STATIC_IP:-192.168.1.50/24}")"
    GATEWAY="$(ask "Gateway" "Gateway" "${GATEWAY:-192.168.1.1}")"
    NET="ip=${STATIC_IP},gw=${GATEWAY}"
  fi

  CT_VLAN="$(ask "VLAN" "VLAN-Tag (leer = keins)" "$CT_VLAN")"
  if [[ -n "$CT_VLAN" ]]; then
    if [[ ! "$CT_VLAN" =~ ^[0-9]+$ ]] || ((CT_VLAN < 1 || CT_VLAN > 4094)); then
      info_box "VLAN" "Ungültiger Tag — VLAN wird weggelassen."
      CT_VLAN=""
    fi
  fi

  CT_DNS="$(ask "DNS" "DNS-Server (leer = Proxmox-Standard)" "$CT_DNS")"
  CT_SEARCH="$(ask "Suchdomain" "DNS-Suchdomain (leer = keine)" "$CT_SEARCH")"

  if yesno "IPv6" "IPv6 aktivieren?"; then
    CT_IPV6=1
  else
    CT_IPV6=0
  fi

  PW="$(ask_secret "Passwort" "root-Passwort (leer = zufällig erzeugen)")"

  if yesno "SSH" "SSH-Zugang für root aktivieren?" --defaultno; then
    CT_SSH=1
  else
    CT_SSH=0
  fi

  if yesno "Autostart" "Container beim Host-Start automatisch starten?"; then
    CT_ONBOOT=1
  else
    CT_ONBOOT=0
  fi

  if yesno "Schutz" "Löschschutz aktivieren (Protection)?" --defaultno; then
    CT_PROTECTION=1
  else
    CT_PROTECTION=0
  fi

  if yesno "Privilegien" "Unprivilegierten Container anlegen?\n(Empfohlen: Ja. Nein = privilegiert)"; then
    CT_UNPRIVILEGED=1
  else
    CT_UNPRIVILEGED=0
  fi

  CT_TAGS="$(ask "Tags" "Proxmox-Tags (Semikolon-getrennt)" "$CT_TAGS")"

  local tz_choice
  tz_choice="$(whiptail --backtitle "$APP" --title "Zeitzone" --menu "Zeitzone des Containers" 16 70 6 \
    "1" "Europe/Berlin" \
    "2" "Europe/Vienna" \
    "3" "Europe/Zurich" \
    "4" "UTC" \
    "5" "Wie der Host" \
    "6" "Andere …" 3>&1 1>&2 2>&3)" || exit 0
  case "$tz_choice" in
    1) CT_TIMEZONE="Europe/Berlin" ;;
    2) CT_TIMEZONE="Europe/Vienna" ;;
    3) CT_TIMEZONE="Europe/Zurich" ;;
    4) CT_TIMEZONE="UTC" ;;
    5) CT_TIMEZONE="" ;;
    6) CT_TIMEZONE="$(ask "Zeitzone" "z. B. Europe/Berlin" "Europe/Berlin")" ;;
  esac

  APP_PORT="$(ask_int "Web-Port" "Port der ProxPanel-Oberfläche" "$APP_PORT" 1 65535)"
  PVE_URL="$(ask "Proxmox-API" "URL der Proxmox-API" "$PVE_URL")"
  [[ -z "$PVE_URL" ]] && PVE_URL="https://$(pve_host_ip):8006"

  if yesno "TLS" "TLS-Zertifikat der Proxmox-API prüfen?\n(Bei Self-Signed typischerweise Nein)" --defaultno; then
    PROXMOX_INSECURE="false"
  else
    PROXMOX_INSECURE="true"
  fi

  PROXMOX_USER_CFG="$(ask "Benutzer" "Proxmox-Benutzer zum Vorausfüllen (leer = überspringen)" "${PROXMOX_USER_CFG}")"
  if [[ -n "$PROXMOX_USER_CFG" ]]; then
    PROXMOX_REALM_CFG="$(ask "Realm" "Realm" "${PROXMOX_REALM_CFG:-pam}")"
  else
    PROXMOX_REALM_CFG=""
  fi

  if yesno "API-Token" "API-Token in die .env schreiben?\n(Sonst Login nur über die Weboberfläche)" --defaultno; then
    PROXMOX_TOKEN_ID_CFG="$(ask "Token-ID" "z. B. root@pam!proxpanel" "${PROXMOX_TOKEN_ID_CFG:-}")"
    PROXMOX_TOKEN_SECRET_CFG="$(ask_secret "Token-Secret" "Token-Secret")"
  else
    PROXMOX_TOKEN_ID_CFG=""
    PROXMOX_TOKEN_SECRET_CFG=""
  fi
}

confirm_custom_settings() {
  local net_txt tls_txt token_txt tz_txt vlan_txt
  if [[ "$NET" == "dhcp" ]]; then
    net_txt="DHCP"
  else
    net_txt="${STATIC_IP}  gw ${GATEWAY}"
  fi
  [[ "$PROXMOX_INSECURE" == "true" ]] && tls_txt="nicht prüfen" || tls_txt="prüfen"
  [[ -n "$PROXMOX_TOKEN_ID_CFG" ]] && token_txt="$PROXMOX_TOKEN_ID_CFG" || token_txt="nein"
  [[ -n "$CT_TIMEZONE" ]] && tz_txt="$CT_TIMEZONE" || tz_txt="Host"
  [[ -n "$CT_VLAN" ]] && vlan_txt="$CT_VLAN" || vlan_txt="—"

  local summary
  summary="$(
    cat <<EOF
Container-ID:      ${CTID}
Hostname:          ${HN}
CPU / RAM / Disk:  ${CPU} / ${RAM} MiB / ${DISK} GiB  (Swap ${CT_SWAP} MiB)
Storage:           ${STORAGE}   Template: ${TPL_STORAGE}
Bridge:            ${BRG}   VLAN: ${vlan_txt}
Netzwerk:          ${net_txt}
IPv6 / SSH:        $(yn_de "$CT_IPV6") / $(yn_de "$CT_SSH")
Autostart / Schutz: $(yn_de "$CT_ONBOOT") / $(yn_de "$CT_PROTECTION")
Unprivilegiert:    $(yn_de "$CT_UNPRIVILEGED")
Zeitzone / Tags:   ${tz_txt} / ${CT_TAGS:-—}
Web-Port:          ${APP_PORT}
Proxmox-API:       ${PVE_URL}
TLS / Token:       ${tls_txt} / ${token_txt}

Container mit diesen Einstellungen anlegen?
EOF
  )"
  whiptail --backtitle "$APP" --title "Zusammenfassung" --yesno "$summary" 24 78
}

create_container() {
  header_info
  need_root

  if ! is_pve_host; then
    msg_error "Dieses Script muss auf einem Proxmox-VE-Host laufen (pct/pveversion fehlen)."
    exit 1
  fi

  msg_ok "Beziehe App und Abhängigkeiten von GitHub: ${REPO_URL} (${REPO_BRANCH})"

  CTID="$(next_ctid)"
  HN="proxpanel"
  CPU="2"
  RAM="2048"
  DISK="8"
  PW=""
  NET="dhcp"
  STATIC_IP=""
  GATEWAY=""
  CT_SWAP="512"
  CT_ONBOOT=1
  CT_UNPRIVILEGED=1
  CT_PROTECTION=0
  CT_SSH=0
  CT_VLAN=""
  CT_DNS=""
  CT_SEARCH=""
  CT_IPV6=1
  CT_TIMEZONE=""
  CT_TAGS="proxpanel"
  APP_PORT="3000"
  PVE_URL="https://$(pve_host_ip):8006"
  PROXMOX_INSECURE="true"
  PROXMOX_USER_CFG=""
  PROXMOX_REALM_CFG=""
  PROXMOX_TOKEN_ID_CFG=""
  PROXMOX_TOKEN_SECRET_CFG=""

  storages=()
  mapfile -t storages < <(list_storages rootdir)
  STORAGE="${storages[0]:-local-lvm}"

  templates=()
  mapfile -t templates < <(list_storages vztmpl)
  TPL_STORAGE="${templates[0]:-local}"

  bridges=()
  mapfile -t bridges < <(list_bridges)
  BRG="${bridges[0]:-vmbr0}"

  local MODE="1"
  if [[ -t 0 && "${DEFAULTS:-}" != "yes" ]]; then
    MODE="$(whiptail --backtitle "$APP" --title "$APP LXC" --menu "Installationsart" 15 74 2 \
      "1" "Standard — Debian 12, DHCP, 2 CPU / 2 GiB / 8 GiB" \
      "2" "Custom — CPU, Netz, Port, Proxmox-API u. a. selbst wählen" 3>&1 1>&2 2>&3 || true)"
    [[ -z "$MODE" ]] && exit 0
  fi

  if [[ "$MODE" == "2" ]]; then
    while true; do
      collect_custom_settings
      if confirm_custom_settings; then
        break
      fi
      if ! yesno "Custom" "Einstellungen erneut anpassen?\n(Nein = Abbruch)"; then
        exit 0
      fi
    done
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
  if [[ "$MODE" == "2" && "${CT_IPV6}" == "1" ]]; then
    net0+=",ip6=auto"
  fi
  if [[ -n "$CT_VLAN" ]]; then
    net0+=",tag=${CT_VLAN}"
  fi

  local create_opts=(
    --hostname "$HN"
    --cores "$CPU"
    --memory "$RAM"
    --swap "$CT_SWAP"
    --rootfs "${STORAGE}:${DISK}"
    --net0 "$net0"
    --unprivileged "$CT_UNPRIVILEGED"
    --features nesting=1
    --onboot "$CT_ONBOOT"
    --password "$PW"
    --description "ProxPanel - Proxmox Web-Verwaltung"
    --start 0
  )
  [[ -n "$CT_DNS" ]] && create_opts+=(--nameserver "$CT_DNS")
  [[ -n "$CT_SEARCH" ]] && create_opts+=(--searchdomain "$CT_SEARCH")
  [[ -n "$CT_TAGS" ]] && create_opts+=(--tags "$CT_TAGS")
  [[ "$CT_PROTECTION" == "1" ]] && create_opts+=(--protection 1)

  pct create "$CTID" "${TPL_STORAGE}:vztmpl/${TEMPLATE}" "${create_opts[@]}"
  msg_ok "Container ${CTID} angelegt"

  msg_info "Starte Container …"
  pct start "$CTID"
  sleep 4
  msg_ok "Container läuft"

  [[ -z "$PVE_URL" ]] && PVE_URL="https://$(pve_host_ip):8006"
  install_inside_ct "$CTID"

  local IP
  IP="$(ct_ip "$CTID" || true)"
  [[ -z "$IP" ]] && IP="(DHCP-IP in der PVE-UI prüfen)"

  pct set "$CTID" --description "ProxPanel - http://${IP}:${APP_PORT}"

  echo
  msg_ok "ProxPanel ist installiert"
  echo
  echo -e "${TAB}${INFO}  URL:          ${GN}http://${IP}:${APP_PORT}${CL}"
  echo -e "${TAB}${INFO}  Container:    ${GN}${CTID}${CL} (${HN})"
  echo -e "${TAB}${INFO}  Proxmox-API:  ${GN}${PVE_URL}${CL}  (in .env hinterlegt)"
  if [[ "$PW_GENERATED" == "1" ]]; then
    echo -e "${TAB}${INFO}  root-Passwort:${GN} ${PW}${CL}"
  fi
  if [[ "$CT_SSH" == "1" ]]; then
    echo -e "${TAB}${INFO}  SSH:          ${GN}ssh root@${IP}${CL}"
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
