// Bundles the Node entry points that the Docker image runs next to the Next.js
// standalone server (`node migrate.js`, `node worker.js`) into self-contained
// files: the standalone output only ships the dependencies the web app uses.
import { build } from 'esbuild';

await build({
  entryPoints: {
    migrate: 'src/entrypoints/migrate.ts',
    worker: 'src/entrypoints/worker.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // Optional native binding that pg only loads when asked to.
  external: ['pg-native'],
  logLevel: 'info',
});
