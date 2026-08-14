export const POWER_CONFIRMS: Record<
  "shutdown" | "stop" | "reboot",
  { title: string; body: string; confirm: string; danger?: boolean }
> = {
  shutdown: {
    title: "Gast herunterfahren?",
    body: "Es wird ein geordnetes Herunterfahren ausgelöst. Ungespeicherte Daten in laufenden Programmen können verloren gehen.",
    confirm: "Herunterfahren",
  },
  stop: {
    title: "Gast hart stoppen?",
    body: "Das entspricht dem Ziehen des Stromkabels. Es kann zu Datenverlust oder Dateisystemschäden kommen.",
    confirm: "Stoppen",
    danger: true,
  },
  reboot: {
    title: "Gast neu starten?",
    body: "Der Gast wird neu gestartet. Laufende Dienste werden kurz unterbrochen.",
    confirm: "Neustarten",
  },
};
