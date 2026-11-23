import { isAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";

/** Leads as CSV, for Peter's weekly scorecard. */
export async function GET() {
  if (!(await isAdmin())) return new Response("Not signed in", { status: 401 });
  const rows = (await sql`select email, kind, persona, utm, created_at from leads order by created_at desc`) as Record<string, string>[];
  // A cell starting with = + - @ or a tab is a formula to a spreadsheet: prefix it so it stays text.
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const csv = ["email,kind,persona,utm,created_at", ...rows.map((r) => [r.email, r.kind, r.persona, r.utm, new Date(r.created_at).toISOString()].map(esc).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=roger-leads.csv" } });
}
