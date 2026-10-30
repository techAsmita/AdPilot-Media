/** Word count, shared by the verifier's length checks and the editor's counters. */
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
