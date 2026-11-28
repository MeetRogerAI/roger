"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";
import { readUtm } from "@/lib/session";
import { isSiteAudience, startHref, type SiteAudience } from "@/lib/site/start-link";
import { chosenCurrency, subscribeCurrency } from "./currency-store";

/**
 * Every start button on the public site (plan KTD9). The server renders a
 * plain link to /start, with `path` when the page has an audience, so it works
 * with no script. In the browser the link also carries the last audience seen
 * this visit, the chosen currency and the campaign tags ClientBoot captured.
 */
const audienceKey = "roger.audience";
const audienceEvent = "roger-audience";

function rememberedAudience(): SiteAudience | null {
  try {
    const saved = sessionStorage.getItem(audienceKey);
    return isSiteAudience(saved) ? saved : null;
  } catch {
    return null;
  }
}

function rememberAudience(audience: SiteAudience) {
  try {
    sessionStorage.setItem(audienceKey, audience);
  } catch {
    /* Storage is unavailable: links on this page still carry the page's own audience. */
  }
  window.dispatchEvent(new Event(audienceEvent));
}

function subscribe(listener: () => void) {
  const stopCurrency = subscribeCurrency(listener);
  window.addEventListener(audienceEvent, listener);
  return () => {
    stopCurrency();
    window.removeEventListener(audienceEvent, listener);
  };
}

export type StartContext = {
  /** The audience of the page this button is on: "re" on the homepage, "agents" on the free Zack run (/zack), none elsewhere. */
  audience?: SiteAudience;
  /** The token of a free Zack run, on /zack. */
  zack?: string;
  /** A referral code to carry through. */
  referral?: string;
};

/** The address for a start button, kept current as the visitor changes currency or page. */
export function useStartHref({ audience, zack, referral }: StartContext = {}): string {
  const plain = startHref({ audience, zack, ref: referral });
  const href = useSyncExternalStore(
    subscribe,
    () => startHref({ audience, remembered: rememberedAudience(), currency: chosenCurrency(), zack, ref: referral, tags: readUtm() }),
    () => plain,
  );
  // A page with an audience sets it for the audience-less pages read afterwards, and for the header on this one.
  useEffect(() => {
    if (audience) rememberAudience(audience);
  }, [audience]);
  return href;
}

export function StartLink({ audience, zack, referral, ...link }: StartContext & Omit<ComponentProps<typeof Link>, "href">) {
  return <Link {...link} href={useStartHref({ audience, zack, referral })} />;
}
