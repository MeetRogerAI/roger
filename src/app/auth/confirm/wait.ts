/** The words of a sign-in link's page while it signs the reader in, and if that takes too long. */
export const WAIT = {
  waiting: "Signing you in…",
  late: "This is taking longer than it should. Press the button to sign in.",
};

/** How long the page waits for its own press, counted from the page load and again from the press itself. */
export const CONFIRM_WAIT_SECONDS = 6;

/**
 * Scoped to this page's own classes. Before the delay, "Signing you in…" holds the place and the button is
 * invisible; at the delay they swap. AutoConfirm marks the stack when it presses (`data-pressed`), which starts a
 * second, equally long delay from the press: a tab opened in the background that is looked at later does not show
 * the button while its press is on its way. A fixed string: nothing from the request.
 */
export const CONFIRM_WAIT_CSS = [
  ".confirm-wait,.confirm-js{display:none}",
  ".js .confirm-nojs{display:none}",
  ".js .confirm-wait,.js .confirm-js{display:block}",
  ".js .confirm-stack{display:grid}",
  ".js .confirm-stack>*{grid-area:1/1}",
  `.js .confirm-late{visibility:hidden;animation:confirm-show 0s linear ${CONFIRM_WAIT_SECONDS}s forwards}`,
  `.js .confirm-wait{animation:confirm-hide 0s linear ${CONFIRM_WAIT_SECONDS}s forwards}`,
  `.js [data-pressed] .confirm-late{animation-name:confirm-show-again}`,
  `.js [data-pressed] .confirm-wait{animation-name:confirm-hide-again}`,
  "@keyframes confirm-show{to{visibility:visible}}",
  "@keyframes confirm-show-again{to{visibility:visible}}",
  "@keyframes confirm-hide{to{visibility:hidden}}",
  "@keyframes confirm-hide-again{to{visibility:hidden}}",
].join("");
