/**
 * The launch list (plan R25, Peter, November 27, 2026): the owner's checklist
 * of what must be read and ticked before a release. Its address is this one
 * constant, so it is changed in one place.
 *
 * The Pages screen shows the note at its top and each page's editing screen
 * repeats the link. It is an address outside the site, so it opens in a new
 * tab and hands the other page nothing about this one.
 */
export const LAUNCH_LIST_URL = "https://claude.ai/artifact/3A2CqfXuFDnr7PDYq776Wj";

export function LaunchListLink({ children }: { children: React.ReactNode }) {
  return (
    <a href={LAUNCH_LIST_URL} target="_blank" rel="noopener noreferrer" data-launch-list className="tlink">
      {children}
    </a>
  );
}

/** The note at the top of the Pages screen. */
export function LaunchListNote() {
  return (
    <p data-launch-note className="rounded-[8px] border border-rule bg-accent-wash px-4 py-3 text-small text-ink">
      Before a release, read each page and tick its checks on the launch list. <LaunchListLink>Open the launch list (opens in a new tab)</LaunchListLink>
    </p>
  );
}

/** The one line on a page's editing screen. */
export function LaunchListLine({ page }: { page: string }) {
  return (
    <p data-launch-line className="text-small text-ink-2">
      Before a release, read {page} and tick its checks on the launch list. <LaunchListLink>Open the launch list (opens in a new tab)</LaunchListLink>
    </p>
  );
}
