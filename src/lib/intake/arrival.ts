import type { Query } from "@/lib/db-query";
import type { Stored } from "@/lib/zack/receive";
import { gatewayModel } from "./model";
import { processProfile, processRun } from "./process";

/** Processes the run or profile a user just sent (spec B.6: "as it arrives"). */
export async function processArrived(q: Query, stored: Stored): Promise<void> {
  if (stored.kind === "run") await processRun(q, stored.id, { model: gatewayModel, query: q });
  else await processProfile(q, stored.id);
}
