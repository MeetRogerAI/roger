import { connection } from "next/server";
import { TestimonialForm } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { listTestimonials } from "@/lib/admin/content";
import { query } from "@/lib/db-query";
import { testimonialSwitchAction } from "../v3-actions";

/** Testimonials (spec B.12): add, edit, order, and the cleared switch. The public site shows cleared rows only. */
export default async function TestimonialsPage() {
  await connection();
  if (!(await isAdmin())) return null;
  const rows = await listTestimonials(query);

  return (
    <section className="max-w-[56rem] space-y-10">
      <header>
        <h1 className="text-h3">Testimonials</h1>
        <p className="mt-2 text-small text-ink-2">The public site shows only the cleared ones, in this order.</p>
      </header>

      {rows.length === 0 ? (
        <p className="text-small text-ink-2">No testimonials yet.</p>
      ) : (
        <ol className="space-y-6">
          {rows.map((t, i) => (
            <li key={t.id} className="rounded-[8px] border border-rule bg-surface p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3 text-small">
                <span className={t.cleared ? "font-[600] text-accent" : "text-ink-2"}>{t.cleared ? "Shown on the site" : "Hidden"}</span>
                <form action={testimonialSwitchAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="cleared" value={t.cleared ? "off" : "on"} />
                  <button type="submit" className="tlink">
                    {t.cleared ? "Hide" : "Show"}
                    <span className="sr-only"> {t.person}’s quote</span>
                  </button>
                </form>
                {i > 0 && (
                  <form action={testimonialSwitchAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="move" value="up" />
                    <button type="submit" className="tlink">
                      Move up<span className="sr-only"> {t.person}’s quote</span>
                    </button>
                  </form>
                )}
                {i < rows.length - 1 && (
                  <form action={testimonialSwitchAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="move" value="down" />
                    <button type="submit" className="tlink">
                      Move down<span className="sr-only"> {t.person}’s quote</span>
                    </button>
                  </form>
                )}
              </div>
              <TestimonialForm key={JSON.stringify(t)} t={t} />
            </li>
          ))}
        </ol>
      )}

      <div>
        <h2 className="text-title">Add a testimonial</h2>
        <div className="mt-4">
          <TestimonialForm />
        </div>
      </div>
    </section>
  );
}
