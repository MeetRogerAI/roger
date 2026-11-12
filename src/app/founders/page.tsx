import type { Metadata } from "next";
import HamptonPage, { metadata as hampton } from "../hampton/page";

// The same Zack instructions as /hampton, at a link for the founders group
export const metadata: Metadata = {
  ...hampton,
  alternates: { canonical: "/founders" },
  openGraph: { ...hampton.openGraph, url: "/founders" },
};

export default HamptonPage;
