import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [runtime, pluginZip, casesFile] = process.argv.slice(2);
if (!runtime || !pluginZip || !casesFile) {
  throw new Error('Usage: node run-playground.mjs RUNTIME_DIR WOOCOMMERCE_ZIP SYNTHETIC_CASES_JSON');
}

const requireRuntime = createRequire(resolve(runtime, 'package.json'));
const { runCLI } = await import(pathToFileURL(requireRuntime.resolve('@wp-playground/cli')).href);
const integrationDir = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'veygrit-woo-'));
try {
  await Promise.all([
    copyFile(pluginZip, join(temp, 'woocommerce.zip')),
    copyFile(casesFile, join(temp, 'cases.json')),
  ]);
  await runCLI({
    command: 'run-blueprint',
    php: '8.3',
    wp: '6.9.4',
    verbosity: 'quiet',
    'define-bool': { WP_HTTP_BLOCK_EXTERNAL: true, DISABLE_WP_CRON: true },
    mount: [
      { hostPath: integrationDir, vfsPath: '/veygrit-test' },
      { hostPath: temp, vfsPath: '/veygrit-test-data' },
    ],
    blueprint: {
      steps: [
        {
          step: 'installPlugin',
          pluginData: { resource: 'vfs', path: '/veygrit-test-data/woocommerce.zip' },
          options: { activate: true },
        },
        {
          step: 'runPHP',
          code: "<?php require '/veygrit-test/tests/woo-order.php';",
        },
      ],
    },
  });
  const report = JSON.parse(await readFile(join(temp, 'report.json'), 'utf8'));
  process.stdout.write(JSON.stringify(report) + '\n');
} finally {
  await rm(temp, { recursive: true, force: true });
}
