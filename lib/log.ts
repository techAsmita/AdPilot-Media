// Minimal structured logging. Every server-side line carries the request id that
// produced it, so the four model calls, the image call and any provider failure
// from one run can be read together instead of guessed at.

export type Log = {
  id: string;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
};

export const newRequestId = () => Math.random().toString(36).slice(2, 10);

const fmt = (fields?: Record<string, unknown>) =>
  fields
    ? Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${typeof v === "string" && /\s/.test(v) ? JSON.stringify(v) : String(v)}`)
        .join(" ")
    : "";

export function makeLog(id = newRequestId()): Log {
  const line = (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => {
    const msg = `[${id}] ${event}${fields ? " " + fmt(fields) : ""}`;
    if (level === "error") console.error(msg);
    else if (level === "warn") console.warn(msg);
    else console.log(msg);
  };
  return {
    id,
    info: (e, f) => line("info", e, f),
    warn: (e, f) => line("warn", e, f),
    error: (e, f) => line("error", e, f),
  };
}

/** Used when a code path has no request context (module init, background warmup). */
export const rootLog = makeLog("server");
