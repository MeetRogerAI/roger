import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { editorAddress } from "@/lib/site/content/labels";

/**
 * The old Edit Questions screen. Questions and answers are edited in Pages
 * now (plan R10, U5), with every other word of the site: saved as a draft,
 * then published. An address someone kept still lands where the questions
 * are, on the FAQ page's editing screen.
 */
export default async function QuestionsPage() {
  await connection();
  if (!(await isAdmin())) return null;
  redirect(editorAddress("faq"));
}
