import { useQuery } from "@tanstack/react-query";
import { dataApi } from "../api";
import {
  iconDraftFromRecord,
  LogoPreview,
  resolveIconSrc,
} from "./GuestIconPicker";
import { guestIconKey } from "../guestIconKey";
import type { GuestIconRecord } from "../types";

export function useGuestIcons() {
  return useQuery({
    queryKey: ["guestIcons"],
    queryFn: () => dataApi.guestIcons(),
    staleTime: 30_000,
  });
}

export function ServiceIcon({
  name,
  tags,
  node,
  type,
  vmid,
  record,
  className = "size-10",
  editable,
  onEdit,
}: {
  name?: string | null;
  tags?: string | null;
  node?: string;
  type?: string;
  vmid?: number | string;
  /** Optional preloaded record; otherwise looked up from cache */
  record?: GuestIconRecord | null;
  className?: string;
  editable?: boolean;
  onEdit?: () => void;
}) {
  const icons = useGuestIcons();
  const key =
    node && type && vmid != null ? guestIconKey(node, type, vmid) : null;
  const stored =
    record !== undefined
      ? record
      : key
        ? icons.data?.icons?.[key] || null
        : null;

  const draft = iconDraftFromRecord(stored);
  const { src, label } = resolveIconSrc(draft, name, tags);

  // mode none → hide entirely unless editable (show placeholder to change)
  if (draft.mode === "none" && !editable) return null;
  if (!src && !editable) return null;

  const inner = (
    <LogoPreview src={src} className={className} />
  );

  if (!editable) {
    return (
      <span title={label} aria-label={label}>
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      title={`${label} — click to change`}
      className="group relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {inner}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
        Edit
      </span>
    </button>
  );
}
