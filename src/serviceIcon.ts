/**
 * Map guest names/tags → Dashboard Icons CDN slugs.
 * Only distinctive aliases — ambiguous names return no icon.
 *
 * Icons: https://github.com/homarr-labs/dashboard-icons
 */
export type ServiceIconMatch = {
  slug: string;
  label: string;
};

type Alias = {
  /** Whole-word tokens (normalized, lowercase, no punctuation). Longest first preferred. */
  keys: string[];
  slug: string;
  label: string;
};

const ALIASES: Alias[] = [
  { keys: ["homeassistant", "home assistant", "hass", "hassio"], slug: "home-assistant", label: "Home Assistant" },
  { keys: ["nextcloud"], slug: "nextcloud", label: "Nextcloud" },
  { keys: ["jellyfin"], slug: "jellyfin", label: "Jellyfin" },
  { keys: ["jellyseerr", "jellyseer"], slug: "jellyseerr", label: "Jellyseerr" },
  { keys: ["overseerr"], slug: "overseerr", label: "Overseerr" },
  { keys: ["plex"], slug: "plex", label: "Plex" },
  { keys: ["emby"], slug: "emby", label: "Emby" },
  { keys: ["sonarr"], slug: "sonarr", label: "Sonarr" },
  { keys: ["radarr"], slug: "radarr", label: "Radarr" },
  { keys: ["lidarr"], slug: "lidarr", label: "Lidarr" },
  { keys: ["bazarr"], slug: "bazarr", label: "Bazarr" },
  { keys: ["prowlarr"], slug: "prowlarr", label: "Prowlarr" },
  { keys: ["sabnzbd"], slug: "sabnzbd", label: "SABnzbd" },
  { keys: ["nzbget"], slug: "nzbget", label: "NZBGet" },
  { keys: ["qbittorrent", "qbit"], slug: "qbittorrent", label: "qBittorrent" },
  { keys: ["transmission"], slug: "transmission", label: "Transmission" },
  { keys: ["deluge"], slug: "deluge", label: "Deluge" },
  { keys: ["portainer"], slug: "portainer", label: "Portainer" },
  { keys: ["nginxproxymanager", "nginx proxy manager", "npm"], slug: "nginx-proxy-manager", label: "Nginx Proxy Manager" },
  { keys: ["traefik"], slug: "traefik", label: "Traefik" },
  { keys: ["caddy"], slug: "caddy", label: "Caddy" },
  { keys: ["nginx"], slug: "nginx", label: "Nginx" },
  { keys: ["apache", "httpd"], slug: "apache", label: "Apache" },
  { keys: ["pihole", "pi hole", "pi-hole"], slug: "pi-hole", label: "Pi-hole" },
  { keys: ["adguard", "adguardhome", "adguard home"], slug: "adguard-home", label: "AdGuard Home" },
  { keys: ["unbound"], slug: "unbound", label: "Unbound" },
  { keys: ["wireguard"], slug: "wireguard", label: "WireGuard" },
  { keys: ["openvpn"], slug: "openvpn", label: "OpenVPN" },
  { keys: ["tailscale"], slug: "tailscale", label: "Tailscale" },
  { keys: ["cloudflared", "cloudflare tunnel"], slug: "cloudflare", label: "Cloudflare" },
  { keys: ["authentik"], slug: "authentik", label: "Authentik" },
  { keys: ["authelia"], slug: "authelia", label: "Authelia" },
  { keys: ["vaultwarden", "bitwarden"], slug: "vaultwarden", label: "Vaultwarden" },
  { keys: ["immich"], slug: "immich", label: "Immich" },
  { keys: ["photoprism"], slug: "photoprism", label: "PhotoPrism" },
  { keys: ["paperless", "paperlessngx", "paperless ngx"], slug: "paperless-ngx", label: "Paperless-ngx" },
  { keys: ["bookstack"], slug: "bookstack", label: "BookStack" },
  { keys: ["wikijs", "wiki js", "wiki.js"], slug: "wikijs", label: "Wiki.js" },
  { keys: ["grafana"], slug: "grafana", label: "Grafana" },
  { keys: ["prometheus"], slug: "prometheus", label: "Prometheus" },
  { keys: ["influxdb", "influx"], slug: "influxdb", label: "InfluxDB" },
  { keys: ["uptimekuma", "uptime kuma"], slug: "uptime-kuma", label: "Uptime Kuma" },
  { keys: ["netdata"], slug: "netdata", label: "Netdata" },
  { keys: ["zabbix"], slug: "zabbix", label: "Zabbix" },
  { keys: ["gitlab"], slug: "gitlab", label: "GitLab" },
  { keys: ["gitea"], slug: "gitea", label: "Gitea" },
  { keys: ["forgejo"], slug: "forgejo", label: "Forgejo" },
  { keys: ["jenkins"], slug: "jenkins", label: "Jenkins" },
  { keys: ["docker"], slug: "docker", label: "Docker" },
  { keys: ["kubernetes", "k8s"], slug: "kubernetes", label: "Kubernetes" },
  { keys: ["postgres", "postgresql"], slug: "postgresql", label: "PostgreSQL" },
  { keys: ["mariadb"], slug: "mariadb", label: "MariaDB" },
  { keys: ["mysql"], slug: "mysql", label: "MySQL" },
  { keys: ["mongodb", "mongo"], slug: "mongodb", label: "MongoDB" },
  { keys: ["redis"], slug: "redis", label: "Redis" },
  { keys: ["elasticsearch", "elastic"], slug: "elasticsearch", label: "Elasticsearch" },
  { keys: ["rabbitmq"], slug: "rabbitmq", label: "RabbitMQ" },
  { keys: ["mqtt", "mosquitto"], slug: "mosquitto", label: "Mosquitto" },
  { keys: ["zigbee2mqtt", "z2m"], slug: "zigbee2mqtt", label: "Zigbee2MQTT" },
  { keys: ["frigate"], slug: "frigate", label: "Frigate" },
  { keys: ["homebridge"], slug: "homebridge", label: "Homebridge" },
  { keys: ["esphome"], slug: "esphome", label: "ESPHome" },
  { keys: ["nodered", "node red", "node-red"], slug: "node-red", label: "Node-RED" },
  { keys: ["wordpress", "wp"], slug: "wordpress", label: "WordPress" },
  { keys: ["mattermost"], slug: "mattermost", label: "Mattermost" },
  { keys: ["rocketchat", "rocket chat"], slug: "rocket-chat", label: "Rocket.Chat" },
  { keys: ["matrix", "synapse"], slug: "matrix", label: "Matrix" },
  { keys: ["jitsi"], slug: "jitsi", label: "Jitsi" },
  { keys: ["mailcow"], slug: "mailcow", label: "Mailcow" },
  { keys: ["roundcube"], slug: "roundcube", label: "Roundcube" },
  { keys: ["minio"], slug: "minio", label: "MinIO" },
  { keys: ["seafile"], slug: "seafile", label: "Seafile" },
  { keys: ["syncthing"], slug: "syncthing", label: "Syncthing" },
  { keys: ["filebrowser"], slug: "filebrowser", label: "File Browser" },
  { keys: ["nextcloudaio", "nc aio"], slug: "nextcloud", label: "Nextcloud" },
  { keys: ["onlyoffice"], slug: "onlyoffice", label: "OnlyOffice" },
  { keys: ["ubuntu"], slug: "ubuntu-linux", label: "Ubuntu" },
  { keys: ["debian"], slug: "debian-linux", label: "Debian" },
  { keys: ["fedora"], slug: "fedora", label: "Fedora" },
  { keys: ["arch", "archlinux", "arch linux"], slug: "arch-linux", label: "Arch Linux" },
  { keys: ["windows", "win11", "win10"], slug: "microsoft-windows", label: "Windows" },
  { keys: ["alpine"], slug: "alpine-linux", label: "Alpine" },
  { keys: ["code server", "codeserver"], slug: "vscode", label: "code-server" },
  { keys: ["jupyter", "jupyterlab"], slug: "jupyter", label: "Jupyter" },
  { keys: ["ollama"], slug: "ollama", label: "Ollama" },
  { keys: ["openwebui", "open webui"], slug: "open-webui", label: "Open WebUI" },
  { keys: ["proxpanel"], slug: "proxmox", label: "ProxPanel" },
  { keys: ["proxmox", "pve"], slug: "proxmox", label: "Proxmox" },
  { keys: ["truenas"], slug: "truenas", label: "TrueNAS" },
  { keys: ["unraid"], slug: "unraid", label: "Unraid" },
  { keys: ["opnsense"], slug: "opnsense", label: "OPNsense" },
  { keys: ["pfsense"], slug: "pfsense", label: "pfSense" },
];

const CDN = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg";

/** Ambiguous short keys that must be an exact guest name / single token only. */
const STRICT_ONLY = new Set(["npm", "wp", "hass", "pve", "k8s", "z2m", "mongo", "influx", "elastic", "matrix", "arch"]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Flatten multi-word keys for compact token compare (homeassistant). */
function compact(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * Resolve a service icon from guest name and/or Proxmox tags.
 * Returns null when the service is not clearly identifiable.
 */
export function resolveServiceIcon(
  name?: string | null,
  tags?: string | null,
): ServiceIconMatch | null {
  const nameNorm = normalizeText(name || "");
  if (!nameNorm && !tags) return null;

  const tagParts = (tags || "")
    .split(/[;,]/)
    .map((t) => normalizeText(t))
    .filter(Boolean);

  const nameTokens = tokensOf(nameNorm);
  const allTokens = [...nameTokens, ...tagParts.flatMap(tokensOf)];
  const compactName = compact(nameNorm);

  // Prefer longer keys to avoid "cloud" beating "nextcloud" etc.
  const ranked = ALIASES.flatMap((alias) =>
    alias.keys.map((key) => ({ alias, key, score: key.length })),
  ).sort((a, b) => b.score - a.score);

  for (const { alias, key } of ranked) {
    const keyNorm = normalizeText(key);
    const keyCompact = compact(keyNorm);
    const strict = STRICT_ONLY.has(keyNorm) || keyNorm.length <= 3;

    // Exact name match
    if (nameNorm === keyNorm || compactName === keyCompact) {
      return { slug: alias.slug, label: alias.label };
    }

    // Exact tag match (tags are intentional labels — allow short keys)
    if (tagParts.some((t) => t === keyNorm || compact(t) === keyCompact)) {
      return { slug: alias.slug, label: alias.label };
    }

    if (strict) {
      // Short / ambiguous: only exact name or exact single-token name
      if (nameTokens.length === 1 && (nameTokens[0] === keyNorm || nameTokens[0] === keyCompact)) {
        return { slug: alias.slug, label: alias.label };
      }
      continue;
    }

    // Whole-word / whole-token in name
    if (nameTokens.includes(keyNorm) || nameTokens.includes(keyCompact)) {
      return { slug: alias.slug, label: alias.label };
    }

    // Multi-word key as contiguous phrase in name ("nginx proxy manager")
    if (keyNorm.includes(" ")) {
      const re = new RegExp(`(?:^|\\s)${escapeRegExp(keyNorm)}(?:\\s|$)`);
      if (re.test(nameNorm)) return { slug: alias.slug, label: alias.label };
    }

    // Compact form inside a single token (e.g. ct-nextcloud-01 → nextcloud)
    if (
      keyCompact.length >= 5 &&
      allTokens.some((t) => t === keyCompact || t.includes(keyCompact))
    ) {
      // Require the key to be a clear segment: start, end, or bounded by digits
      const segment = new RegExp(
        `(^|[^a-z])${escapeRegExp(keyCompact)}([^a-z]|$)`,
      );
      if (segment.test(compactName) || allTokens.some((t) => segment.test(t))) {
        return { slug: alias.slug, label: alias.label };
      }
    }
  }

  return null;
}

export function serviceIconUrl(slug: string): string {
  return `${CDN}/${encodeURIComponent(slug)}.svg`;
}

/** Unique catalog entries for the logo picker (slug + label). */
export function listServiceCatalog(): ServiceIconMatch[] {
  const seen = new Set<string>();
  const out: ServiceIconMatch[] = [];
  for (const alias of ALIASES) {
    if (seen.has(alias.slug)) continue;
    seen.add(alias.slug);
    out.push({ slug: alias.slug, label: alias.label });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
