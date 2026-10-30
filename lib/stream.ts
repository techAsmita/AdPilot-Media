// Newline-delimited JSON streaming helper for route handlers.
export function ndjson(run: (send: (e: unknown) => void) => Promise<void>) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => {
        try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch {}
      };
      try { await run(send); }
      catch (err) { send({ type: "error", message: (err as Error).message }); }
      finally { controller.close(); }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
