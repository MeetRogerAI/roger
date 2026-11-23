import { redirect } from "next/navigation";

/** The dashboard home arrives with the Monday list (plan Unit 13). Until then, /app opens the Zack page. */
export default function AppHome() {
  redirect("/app/zack");
}
