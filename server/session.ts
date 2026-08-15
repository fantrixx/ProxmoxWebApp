export type GuestType = "lxc" | "qemu";

export type SessionAuth =
  | {
      kind: "ticket";
      ticket: string;
      csrf: string;
    }
  | {
      kind: "token";
      tokenId: string;
      secret: string;
    };

export type Session = {
  id: string;
  host: string;
  username: string;
  rejectUnauthorized: boolean;
  auth: SessionAuth;
  createdAt: number;
};

const sessions = new Map<string, Session>();
const TTL_MS = 8 * 60 * 60 * 1000;

export function createSession(
  data: Omit<Session, "id" | "createdAt">,
): Session {
  const session: Session = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string | undefined): Session | undefined {
  if (!id) return undefined;
  const session = sessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.createdAt > TTL_MS) {
    sessions.delete(id);
    return undefined;
  }
  return session;
}

export function deleteSession(id: string | undefined): void {
  if (id) sessions.delete(id);
}

export const COOKIE_NAME = "proxpanel_sid";
