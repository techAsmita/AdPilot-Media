import { hasKey } from "@/lib/llm";
import { research } from "@/lib/agent";
export const dynamic = "force-dynamic";
export async function GET() {
  if (hasKey()) research(() => {}, false).catch(() => {});
  return Response.json({ hasKey: hasKey() });
}
