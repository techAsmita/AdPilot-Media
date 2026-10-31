import { hasKey, plannedTextModel } from "@/lib/llm";

export const dynamic = "force-dynamic";

// Read-only: this must not spend model credits. Research is warmed by the
// first real run instead, so simply loading the page costs nothing.
//
// It also reports which provider and model the next run WOULD use, so the status
// badge in the UI is derived from the server's own key detection and model order
// rather than hardcoded on the client.
export async function GET() {
  const planned = plannedTextModel();
  return Response.json({
    hasKey: hasKey(),
    provider: planned.provider,
    providerName: planned.providerName,
    model: planned.model,
    modelLabel: planned.label,
  });
}
