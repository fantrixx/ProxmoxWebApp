export function guestIconKey(node: string, type: string, vmid: number | string): string {
  return `${node}:${type}:${vmid}`;
}
