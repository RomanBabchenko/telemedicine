const path = require('path');
const nodeExternals = require('webpack-node-externals');

/**
 * Custom webpack config for NestJS in a monorepo.
 *
 * Why this exists:
 *   - argon2, bcrypt, sharp etc. are native modules that MUST stay external
 *     (webpack can't bundle .node binaries).
 *   - Default NestJS webpack only looks at apps/api/node_modules. In an npm
 *     workspaces monorepo dependencies are hoisted to ../../node_modules,
 *     so we need to point externals at both locations.
 *   - We DO want to bundle our local @telemed/* workspace packages so
 *     TypeScript path aliases keep working.
 */
module.exports = function (options) {
  return {
    ...options,
    externalsPresets: { node: true },
    externals: [
      nodeExternals({
        modulesDir: path.resolve(__dirname, '../../node_modules'),
        allowlist: [/^@telemed\//],
      }),
      nodeExternals({
        modulesDir: path.resolve(__dirname, 'node_modules'),
        allowlist: [/^@telemed\//],
      }),
    ],
  };
};
