import { Suspense } from "react";
import { NotOpenForm } from "@/components/app/not-open-form";
import { parseStartParams } from "@/lib/signup/params";

/**
 * Every "start" button on the public site lands here (spec 0.6). The query
 * string (path, cur, ref, zack, utm) is read and kept; malformed values are
 * dropped. Sign-up itself arrives with the quiz (plan Unit 5). Until then, and
 * whenever v3.signupOpen is off, this is the "not open yet" note.
 */
async function Start({ searchParams }: { searchParams: PageProps<"/start">["searchParams"] }) {
  const params = parseStartParams(await searchParams);
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

export default function StartPage({ searchParams }: PageProps<"/start">) {
  return (
    <Suspense fallback={<h1 className="text-h2">Roger isn’t open for sign-up yet.</h1>}>
      <Start searchParams={searchParams} />
    </Suspense>
  );
}
