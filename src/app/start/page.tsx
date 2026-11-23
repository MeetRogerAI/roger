import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { categories } from "@/data/categories";
import { zackAgents } from "@/data/zack";
import { NotOpenForm } from "@/components/app/not-open-form";
import { QuizForm } from "@/components/app/quiz-form";
import { getSession } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { stepPaths } from "@/lib/signup/account";
import { parseStartParams } from "@/lib/signup/params";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * Every "start" button on the public site lands here (spec 0.6). The query
 * string (path, cur, ref, zack, utm) is read and kept; malformed values are
 * dropped. With sign-up open this is the quiz (spec B.4, screen 1); with it
 * off, or when the setting cannot be read, it is the "not open yet" note.
 */
async function Start({ searchParams }: { searchParams: PageProps<"/start">["searchParams"] }) {
  const params = parseStartParams(await searchParams);

  // Someone already signed up and signed in carries on where they stopped.
  const session = await getSession();
  if (session) {
    const [u] = await query<{ signup_step: string }>(`select signup_step from users where id = $1`, [session.userId]);
    // Only steps that need no draft cookie; "quiz" and "account" stay here, so there is no loop.
    if (u && ["plan", "card", "done"].includes(u.signup_step)) redirect(stepPaths[u.signup_step]);
  }

  let open = false;
  try {
    open = (await readV3Settings()).signupOpen;
  } catch {
    open = false;
  }

  if (!open) {
    return (
      <>
        <h1 className="text-h2">Roger isn’t open for sign-up yet.</h1>
        <p className="mt-6 max-w-[40rem] text-lead text-ink-2">
          We’re getting the first Monday lists ready. Leave your email and we’ll write once, when you can start. Nothing is charged and
          nothing else is sent.
        </p>
        <NotOpenForm utm={params.utm} />
      </>
    );
  }

  // The currency showing when they clicked, else a guess from their country (changeable at the card step).
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase();
  const withCur = { ...params, cur: params.cur ?? (country === "CA" ? "CAD" : "USD") };
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">Step 1 of 5</p>
      <h1 className="mt-3 text-h2">A few questions first.</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">
        Your answers tell Cora what kind of work you do, so the ideas she picks fit you. Nobody is turned away.
      </p>
      <QuizForm params={withCur} agents={zackAgents.map((a) => ({ value: a.slug, label: a.name }))} categories={categories} />
    </>
  );
}

export default function StartPage({ searchParams }: PageProps<"/start">) {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <Start searchParams={searchParams} />
    </Suspense>
  );
}
