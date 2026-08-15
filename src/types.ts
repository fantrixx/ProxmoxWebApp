export type GuestType = "lxc" | "qemu";

export type ResourceType = GuestType | "node" | "storage" | "sdn" | string;

export type ClusterResource = {
  id: string;
  type: ResourceType;
  node?: string;
  vmid?: number;
  name?: string;
  status?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
  template?: number;
  ips?: string[];
  tags?: string;
  level?: string;
  storage?: string;
  plugintype?: string;
  shared?: number;
};

export type ClusterStatusItem = {
  type: string;
  id?: string;
  name?: string;
  ip?: string;
  local?: number;
  online?: number;
  nodes?: number;
  quorate?: number;
  version?: number;
};

export type ResourcesResponse = {
  resources: ClusterResource[];
  version: { version: string; release: string } | null;
  cluster: ClusterStatusItem[];
};

export type GuestStatus = {
  status: string;
  name?: string;
  vmid?: number;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
  swap?: number;
  maxswap?: number;
  ha?: { managed?: number };
  pid?: number;
  qmpstatus?: string;
};

export type RrdPoint = {
  time: number;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  netin?: number;
  netout?: number;
  disk?: number;
  maxdisk?: number;
  diskread?: number;
  diskwrite?: number;
};

export type GuestDetail = {
  status: GuestStatus;
  config: Record<string, unknown>;
  rrd: RrdPoint[];
  ips: string[];
};

export type Snapshot = {
  name: string;
  description?: string;
  snaptime?: number;
  parent?: string;
  vmstate?: number;
};

export type AuthUser = {
  username: string;
  host: string;
};

export type GuestRates = {
  netin: number;
  netout: number;
  diskread: number;
  diskwrite: number;
};

export type PveTask = {
  upid: string;
  node?: string;
  type?: string;
  status?: string;
  user?: string;
  starttime?: number;
  endtime?: number;
  id?: string;
  saved?: string;
};

export type MediaItem = {
  node: string;
  storage: string;
  volid: string;
  size?: number;
  ctime?: number;
  format?: string;
  notes?: string;
  vmid?: number;
};

export type BackupStorage = { node: string; storage: string; shared?: number };

export type BackupOverviewGuest = {
  node: string;
  type: GuestType;
  vmid: number;
  name: string;
  status?: string;
  backupCount: number;
  lastBackup: MediaItem | null;
};

export type ScheduleAction = "start" | "shutdown" | "stop" | "backup";
export type BackupMode = "snapshot" | "suspend" | "stop";
export type BackupCompress = "zstd" | "gzip" | "lzo" | "0";

export type PowerSchedule = {
  id: string;
  node: string;
  type: "lxc" | "qemu";
  vmid: number;
  name?: string;
  enabled: boolean;
  action: ScheduleAction;
  time: string;
  days: number[];
  /** Required when action is backup — vzdump target storage */
  storage?: string;
  /** vzdump mode; defaults to snapshot (live backup) */
  backupMode?: BackupMode;
  /** vzdump compression; defaults to zstd ("0" = none) */
  compress?: BackupCompress;
  lastRunKey?: string;
  /** Unix epoch seconds of last successful run */
  lastRunAt?: number;
};
