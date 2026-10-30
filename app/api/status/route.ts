import { hasKey } from "@/lib/llm";

export const dynamic = "force-dynamic";

// Read-only: this must not spend model credits. Research is warmed by the
// first real run instead, so simply loading the page costs nothing.
export async function GET() {
  return Response.json({ hasKey: hasKey() });
}
