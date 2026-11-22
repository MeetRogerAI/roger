import type { Metadata } from "next";
import HamptonPage, { metadata as hampton } from "../hampton/page";

// Exactly the same page as /hampton, at its own link
export const metadata: Metadata = {
  ...hampton,
  alternates: { canonical: "/zack" },
  openGraph: { ...hampton.openGraph, url: "/zack" },
};

export default HamptonPage;
