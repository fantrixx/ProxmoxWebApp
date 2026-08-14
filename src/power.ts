export const POWER_CONFIRMS: Record<
  "shutdown" | "stop" | "reboot",
  { title: string; body: string; confirm: string; danger?: boolean }
> = {
  shutdown: {
    title: "Shut down guest?",
    body: "An orderly shutdown will be requested. Unsaved data in running programs may be lost.",
    confirm: "Shut down",
  },
  stop: {
    title: "Force stop guest?",
    body: "This is like pulling the power cord. It can cause data loss or filesystem damage.",
    confirm: "Stop",
    danger: true,
  },
  reboot: {
    title: "Reboot guest?",
    body: "The guest will restart. Running services will be interrupted briefly.",
    confirm: "Reboot",
  },
};
