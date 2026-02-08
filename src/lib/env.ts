/**
 * Runtime environment detection utilities.
 * Used to gate dev-only features like the triage page.
 */

/** Returns true when running on localhost or a dev branch deployment (e.g. dev.audiolist.pages.dev). */
export function isDevDeployment(): boolean {
  const host = window.location.hostname;
  return host === 'localhost'
    || host === '127.0.0.1'
    || host.startsWith('dev.');
}
