import { connection } from "next/server";
import { builtInQuestions } from "@/data/site/v1";
import { isAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { amountPlaceholders } from "@/lib/site/content/text";
import { ANSWER_MAX, QUESTION_MAX, pagesShowing, readQuestionOverrides } from "@/lib/site/questions";
import { QuestionEditor, type EditableQuestion } from "./editor";

/**
 * Edit Questions (Peter's third homepage review, November 27, 2026): every
 * question the marketing pages show, with the pages that show it, each
 * editable and each resettable to the built-in wording.
 *
 * Who can open it: whoever the admin area lets in, which is the layout's gate
 * (an address in the ADMIN_EMAILS environment variable, or the shared
 * password while that login still exists). No address is written in the code.
 * The page checks again itself, and so does the action that saves.
 */
export default async function QuestionsPage() {
  await connection();
  if (!(await isAdmin())) return null;
  const overrides = await readQuestionOverrides(query);
  const all = builtInQuestions();
  const groups = [...new Set(all.map((item) => item.group))];
  const editable = (item: (typeof all)[number]): EditableQuestion => {
    const edit = overrides[item.id];
    return { id: item.id, pages: pagesShowing(item.on), q: edit?.q ?? item.q, a: edit?.a ?? item.a, builtIn: { q: item.q, a: item.a }, edited: Boolean(edit) };
  };

  return (
    <section className="max-w-[56rem] space-y-10">
      <header>
        <h1 className="text-h3">Edit Questions</h1>
        <p className="mt-2 text-small text-ink-2">
          Every question on the marketing pages. A saved change shows on the site from the next page view. Text is printed as plain text. An amount is written as a name in braces and filled in from the settings:{" "}
          {amountPlaceholders.join(", ")}. A change that breaks the site’s wording rules (for example “agent” without “AI” in front, or a claim about time saved or income) is refused, with the reason.
        </p>
      </header>
      {groups.map((group) => (
        <div key={group}>
          <h2 className="text-title">{group}</h2>
          <ul className="mt-4 space-y-4">
            {all
              .filter((item) => item.group === group)
              .map((item) => (
                <QuestionEditor key={item.id} item={editable(item)} questionMax={QUESTION_MAX} answerMax={ANSWER_MAX} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
