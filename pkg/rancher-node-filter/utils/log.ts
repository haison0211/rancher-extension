/**
 * The extension build (node-polyfill-webpack-plugin) replaces every bare `console` with the
 * console-browserify polyfill, which drags ~70 KB (assert, util) into whatever chunk uses it.
 * `globalThis.console` is not rewritten, so small chunks (pod list, shell) stay small.
 */
export const log = globalThis.console;
