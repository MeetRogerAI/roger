import type { Metadata } from "next";
import HamptonPage, { metadata as hampton } from "../hampton/page";

// The same Zack instructions as /hampton, at a link for the RLP group
export const metadata: Metadata = {
  ...hampton,
  alternates: { canonical: "/rlp" },
  openGraph: { ...hampton.openGraph, url: "/rlp" },
};

export default HamptonPage;
