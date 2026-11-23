import { NotReadyForm } from "@/components/app/not-ready-form";
import { startAnyway } from "../actions";

/** Spec B.4, path "not_ready": an honest note before the account step, never a block. */
export default function NotReadyPage() {
  return (
    <>
      <h1 className="text-h2">Roger works best once you use AI agents most days.</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">
        You can start anyway, or leave your email and we’ll check in later.
      </p>
      <form action={startAnyway} className="mt-8">
        <button type="submit" className="btn btn-l">
          Start anyway
        </button>
      </form>
      <h2 className="mt-14 text-title">Check in with me later</h2>
      <NotReadyForm />
    </>
  );
}
