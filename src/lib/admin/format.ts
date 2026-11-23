/** Toronto time, as the existing admin pages show it. */
export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" }) : "never";
