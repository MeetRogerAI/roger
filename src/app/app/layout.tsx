import type { Metadata } from "next";
import { AppNav } from "@/components/app/app-nav";

export const metadata: Metadata = { title: { default: "Roger", template: "%s · Roger" }, robots: { index: false, follow: false } };

/** Signed-in pages render per request (each page checks access itself), so there is no instant shell to keep. */
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <AppNav />
      <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6 lg:py-16">{children}</section>
    </>
  );
}
