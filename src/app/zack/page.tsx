import type { Metadata } from "next";
import HamptonPage, { metadata as hampton } from "../hampton/page";

// The same Zack instructions as /hampton, at a link for anyone running Zack
export const metadata: Metadata = {
  ...hampton,
  alternates: { canonical: "/zack" },
  openGraph: { ...hampton.openGraph, url: "/zack" },
};

export default HamptonPage;
