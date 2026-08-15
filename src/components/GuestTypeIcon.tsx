import { Box, MonitorSmartphone } from "lucide-react";
import type { GuestType } from "../types";
import { guestLabel } from "../format";

export function GuestTypeIcon({
  type,
  className = "size-4",
}: {
  type: GuestType | string;
  className?: string;
}) {
  const isCt = type === "lxc";
  const Icon = isCt ? Box : MonitorSmartphone;
  const label = guestLabel(type);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center text-muted ${className}`}
      title={isCt ? "Container (CT)" : "Virtual machine (VM)"}
      aria-label={label}
    >
      <Icon className="size-full" aria-hidden />
    </span>
  );
}
