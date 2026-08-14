import { useApp } from "../context";

export function IpList({ ips }: { ips?: string[] }) {
  const { toast } = useApp();
  if (!ips?.length) {
    return <span className="font-mono text-[11px] text-muted">no IP</span>;
  }

  async function copy(ip: string) {
    try {
      await navigator.clipboard.writeText(ip);
      toast("ok", `${ip} copied`);
    } catch {
      toast("err", "Could not copy IP");
    }
  }

  return (
    <span className="flex flex-wrap gap-1.5">
      {ips.map((ip) => (
        <button
          key={ip}
          type="button"
          title="Copy IP"
          onClick={() => void copy(ip)}
          className="rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-cyan hover:bg-surface-2"
        >
          {ip}
        </button>
      ))}
    </span>
  );
}
