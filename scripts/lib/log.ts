/**
 * Shared logging utilities for backend scripts.
 */

export function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

export function logError(phase: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message
    : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: string }).message)
    : String(err);
  console.error(`[${timestamp()}] [${phase}] ERROR: ${msg} — ${detail}`);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
