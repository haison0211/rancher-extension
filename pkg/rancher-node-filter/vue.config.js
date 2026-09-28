/**
 * Rancher's extension build config plus size trims.
 *
 * Rancher serves extension files uncompressed and re-downloads them on every page load (F5), so every
 * KB in a chunk is paid again on each reload of the page that needs it. The node list / node detail
 * pages need bundled copies of Rancher's table components; these trims remove code those pages can
 * never run. See FEATURES.md "Bundle".
 */
const path = require('path');
const webpack = require('webpack');

const base = require('./.shell/pkg/vue.config')(__dirname);

module.exports = {
  ...base,

  configureWebpack(config) {
    base.configureWebpack(config);

    // 1. YAML diff view (diff + diff2html + highlight.js). Unreachable on the extension's pages: see build/FileDiffStub.vue
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /(^|[\\/])FileDiff(\.vue)?$/,
      path.join(__dirname, 'build', 'FileDiffStub.vue')
    ));

    // 2. Full lodash (~100 KB) -> lodash-es, so only the functions actually imported are bundled.
    //    Every `lodash` import in @rancher/shell is a named import; `lodash/xyz` paths are unaffected.
    config.resolve.alias['lodash$'] = 'lodash-es';

    // 3. cronstrue (~20 KB): CronJob text / validation only, see build/cronstrue-stub.js
    config.resolve.alias['cronstrue$'] = path.join(__dirname, 'build', 'cronstrue-stub.js');

    // 4. `console` polyfill (console-browserify + assert + util). Browsers have a native console.
    config.plugins = config.plugins.map((plugin) => {
      if (plugin?.constructor?.name === 'NodePolyfillPlugin') {
        const NodePolyfillPlugin = plugin.constructor;

        return new NodePolyfillPlugin({ excludeAliases: ['console'] });
      }

      return plugin;
    });
  },
};
