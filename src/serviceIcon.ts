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
  { keys: ["teamspeak", "teamspeak3", "ts3", "ts server"], slug: "teamspeak", label: "TeamSpeak" },
  { keys: ["discord"], slug: "discord", label: "Discord" },
  { keys: ["minecraft", "paper mc", "papermc", "spigot", "bukkit"], slug: "minecraft", label: "Minecraft" },
  { keys: ["steam", "steamcmd"], slug: "steam", label: "Steam" },
  { keys: ["murmur", "mumble"], slug: "mumble", label: "Mumble" },
  { keys: ["freepbx"], slug: "freepbx", label: "FreePBX" },
];

const CDN = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg";

/** Ambiguous short keys that must be an exact guest name / single token only. */
const STRICT_ONLY = new Set([
  "npm",
  "wp",
  "hass",
  "pve",
  "k8s",
  "z2m",
  "mongo",
  "influx",
  "elastic",
  "matrix",
  "arch",
  "ts3",
]);

/** Common name suffixes/prefixes that shouldn't block a service match. */
const NOISE = new Set([
  "server",
  "servers",
  "srv",
  "svc",
  "service",
  "services",
  "media",
  "mediaserver",
  "app",
  "apps",
  "ct",
  "vm",
  "lxc",
  "qemu",
  "node",
  "host",
  "prod",
  "dev",
  "test",
  "staging",
  "main",
  "backup",
  "new",
  "old",
  "bot",
  "api",
  "db",
  "sql",
  "panel",
  "stack",
  "instance",
  "v1",
  "v2",
  "v3",
]);

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

function stripNoise(token: string): string {
  let t = token.replace(/\d+$/g, "");
  let changed = true;
  while (changed && t.length > 3) {
    changed = false;
    for (const n of NOISE) {
      if (t.length > n.length + 3 && t.endsWith(n)) {
        t = t.slice(0, -n.length);
        changed = true;
        break;
      }
    }
    for (const n of NOISE) {
      if (t.length > n.length + 3 && t.startsWith(n)) {
        t = t.slice(n.length);
        changed = true;
        break;
      }
    }
  }
  return t.replace(/\d+$/g, "");
}

/** True when a guest token clearly refers to the service key. */
function tokenHitsKey(token: string, keyCompact: string): boolean {
  if (!keyCompact || keyCompact.length < 3) return false;
  if (token === keyCompact) return true;
  const stripped = stripNoise(token);
  if (stripped === keyCompact) return true;
  // teamspeakserver, nextcloudapp
  if (token.startsWith(keyCompact) && NOISE.has(token.slice(keyCompact.length))) return true;
  if (stripped.startsWith(keyCompact) && stripped.length - keyCompact.length <= 2) return true;
  // my-teamspeak style already split; also allow key inside longer token with noise around
  if (
    keyCompact.length >= 5 &&
    token.includes(keyCompact) &&
    token.length - keyCompact.length <= 8
  ) {
    const around = token.replace(keyCompact, "");
    if (!around || /^[0-9]+$/.test(around) || NOISE.has(around)) return true;
  }
  return false;
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

  const nameTokens = tokensOf(nameNorm).filter((t) => !NOISE.has(t) && !/^\d+$/.test(t));
  const rawNameTokens = tokensOf(nameNorm);
  const allTokens = [...rawNameTokens, ...tagParts.flatMap(tokensOf)];
  const compactName = compact(nameNorm);
  const strippedCompact = stripNoise(compactName);

  // Prefer longer keys to avoid "cloud" beating "nextcloud" etc.
  const ranked = ALIASES.flatMap((alias) =>
    alias.keys.map((key) => ({ alias, key, score: key.length })),
  ).sort((a, b) => b.score - a.score);

  for (const { alias, key } of ranked) {
    const keyNorm = normalizeText(key);
    const keyCompact = compact(keyNorm);
    const strict = STRICT_ONLY.has(keyNorm) || keyNorm.length <= 3;

    // Exact name match
    if (nameNorm === keyNorm || compactName === keyCompact || strippedCompact === keyCompact) {
      return { slug: alias.slug, label: alias.label };
    }

    // Exact tag match (tags are intentional labels — allow short keys)
    if (tagParts.some((t) => t === keyNorm || compact(t) === keyCompact || stripNoise(compact(t)) === keyCompact)) {
      return { slug: alias.slug, label: alias.label };
    }

    if (strict) {
      if (
        nameTokens.length === 1 &&
        (nameTokens[0] === keyNorm ||
          nameTokens[0] === keyCompact ||
          stripNoise(nameTokens[0]) === keyCompact)
      ) {
        return { slug: alias.slug, label: alias.label };
      }
      continue;
    }

    // Token hit: "teamspeak-server", "ct-nextcloud-01", "TeamSpeakServer"
    if (allTokens.some((t) => tokenHitsKey(t, keyCompact) || tokenHitsKey(t, keyNorm))) {
      return { slug: alias.slug, label: alias.label };
    }

    // Multi-word key as contiguous phrase in name ("nginx proxy manager")
    if (keyNorm.includes(" ")) {
      const re = new RegExp(`(?:^|\\s)${escapeRegExp(keyNorm)}(?:\\s|$)`);
      if (re.test(nameNorm)) return { slug: alias.slug, label: alias.label };
    }

    // Compact whole-name contains key with light noise (teamspeakserver, srvnextcloud)
    if (keyCompact.length >= 4) {
      if (tokenHitsKey(compactName, keyCompact) || tokenHitsKey(strippedCompact, keyCompact)) {
        return { slug: alias.slug, label: alias.label };
      }
      const re = new RegExp(escapeRegExp(keyCompact), "i");
      if (re.test(compactName)) {
        const rest = compactName.replace(keyCompact, "");
        if (!rest || /^[0-9]+$/.test(rest) || NOISE.has(rest) || [...NOISE].some((n) => rest === n || rest === `${n}${n}`)) {
          return { slug: alias.slug, label: alias.label };
        }
        // rest is combination of noise words only
        const restTokens = rest.match(/[a-z]+|[0-9]+/gi) || [];
        if (restTokens.every((p) => NOISE.has(p) || /^\d+$/.test(p))) {
          return { slug: alias.slug, label: alias.label };
        }
      }
    }
  }

  return null;
}

export function serviceIconUrl(slug: string): string {
  return `${CDN}/${encodeURIComponent(slug)}.svg`;
}

export type ServiceIconSuggestion = ServiceIconMatch & {
  /** Higher = more likely */
  score: number;
  reason: string;
};

function sharedPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Fuzzy suggestions for the logo picker — even when auto-detect finds nothing confident.
 * Ranked by how well the guest name/tags resemble known services.
 */
export function suggestServiceIcons(
  name?: string | null,
  tags?: string | null,
  limit = 8,
): ServiceIconSuggestion[] {
  const nameNorm = normalizeText(name || "");
  const tagParts = (tags || "")
    .split(/[;,]/)
    .map((t) => normalizeText(t))
    .filter(Boolean);
  if (!nameNorm && tagParts.length === 0) return [];

  const rawTokens = [
    ...tokensOf(nameNorm),
    ...tagParts.flatMap(tokensOf),
  ].filter((t) => !/^\d+$/.test(t));
  const usefulTokens = rawTokens
    .filter((t) => !NOISE.has(t))
    .map((t) => stripNoise(t))
    .filter((t) => t.length >= 2);
  const compactName = stripNoise(compact(nameNorm));
  const hay = `${nameNorm} ${tagParts.join(" ")} ${compactName}`.toLowerCase();

  const confident = resolveServiceIcon(name, tags);
  const bySlug = new Map<string, ServiceIconSuggestion>();

  const consider = (alias: Alias, score: number, reason: string) => {
    if (score < 12) return;
    const prev = bySlug.get(alias.slug);
    if (!prev || score > prev.score) {
      bySlug.set(alias.slug, {
        slug: alias.slug,
        label: alias.label,
        score,
        reason,
      });
    }
  };

  for (const alias of ALIASES) {
    for (const key of alias.keys) {
      const keyNorm = normalizeText(key);
      const keyCompact = compact(keyNorm);
      if (keyCompact.length < 2) continue;

      if (confident?.slug === alias.slug) {
        consider(alias, 100, "Best match for this name");
        break;
      }

      // Exact token / phrase
      if (usefulTokens.includes(keyNorm) || usefulTokens.includes(keyCompact)) {
        consider(alias, 90, `Name contains “${keyNorm}”`);
        continue;
      }
      if (compactName === keyCompact) {
        consider(alias, 92, "Matches the name exactly");
        continue;
      }
      if (tokenHitsKey(compactName, keyCompact) || usefulTokens.some((t) => tokenHitsKey(t, keyCompact))) {
        consider(alias, 85, `Looks like “${alias.label}”`);
        continue;
      }

      // Substring in haystack (ts in teamspeak is weak — require key length)
      if (keyCompact.length >= 4 && hay.includes(keyCompact)) {
        consider(alias, 70, `Name includes “${keyNorm}”`);
        continue;
      }
      if (keyNorm.includes(" ") && hay.includes(keyNorm)) {
        consider(alias, 75, `Name includes “${keyNorm}”`);
        continue;
      }

      // Prefix / starts-with between name tokens and keys
      for (const token of usefulTokens) {
        if (token.length < 3 || keyCompact.length < 3) continue;
        if (keyCompact.startsWith(token) && token.length >= 4) {
          consider(alias, 40 + token.length, `“${token}…” could be ${alias.label}`);
        } else if (token.startsWith(keyCompact) && keyCompact.length >= 4) {
          consider(alias, 55 + keyCompact.length, `Starts like ${alias.label}`);
        } else {
          const pref = sharedPrefixLen(token, keyCompact);
          const minLen = Math.min(token.length, keyCompact.length);
          if (pref >= 4 && pref / minLen >= 0.6) {
            consider(alias, 25 + pref * 3, `Similar to ${alias.label}`);
          }
        }
      }

      // Compact name shares long prefix with key
      if (compactName.length >= 4 && keyCompact.length >= 4) {
        const pref = sharedPrefixLen(compactName, keyCompact);
        if (pref >= 5) {
          consider(alias, 30 + pref * 2, `Similar to ${alias.label}`);
        }
      }

      // Label word overlap (e.g. name "guard" → AdGuard Home)
      const labelTokens = tokensOf(alias.label).filter((t) => t.length >= 4 && !NOISE.has(t));
      for (const lt of labelTokens) {
        if (usefulTokens.includes(lt) || compactName.includes(lt)) {
          consider(alias, 48, `Related to “${lt}”`);
        }
      }
    }
  }

  return [...bySlug.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
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
