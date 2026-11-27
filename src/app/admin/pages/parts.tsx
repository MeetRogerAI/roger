/** Small pieces the three Pages screens share. A page file may export nothing but its page, so they live here. */

/** "1 draft", "3 drafts". */
export const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Shown in place of a screen when the stored content cannot be read: nothing is guessed, and nothing can be saved over what was not read. */
export function Unreadable() {
  return (
    <p role="alert" data-unreadable className="max-w-[40rem] text-small text-error">
      The site’s saved wording could not be read just now, so nothing is shown here. Nothing was changed. Reload the page to try again.
    </p>
  );
}
