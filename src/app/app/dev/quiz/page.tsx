import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categories } from "@/data/categories";
import { zackAgents } from "@/data/zack";
import { QuizForm } from "@/components/app/quiz-form";

export const metadata: Metadata = { title: "Quiz preview", robots: { index: false, follow: false } };

/** Builder's preview of the sign-up quiz. Submitting it goes to the real action, which needs sign-up open. Not on production. */
export default function QuizPreview() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <section className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
      <h1 className="text-h2">A few questions first.</h1>
      <QuizForm
        params={{ path: "re", cur: "CAD", ref: null, zack: null, utm: "" }}
        agents={zackAgents.map((a) => ({ value: a.slug, label: a.name }))}
        categories={categories}
      />
    </section>
  );
}
