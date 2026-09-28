/**
 * Build-time replacement for `cronstrue` (see ../vue.config.js).
 *
 * cronstrue only turns cron expressions into text for Rancher's CronJob forms / validators. The
 * extension reaches it through bundled copies of Rancher's store code, but never renders a CronJob
 * form, so a no-op keeps ~20 KB out of the node page chunk.
 */
export default { toString: () => '' };
