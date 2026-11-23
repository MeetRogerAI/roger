import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start",
  robots: { index: false, follow: false },
};

export default function StartLayout({ children }: LayoutProps<"/start">) {
  return <section className="mx-auto max-w-[760px] px-4 py-16 sm:px-6 lg:py-24">{children}</section>;
}
