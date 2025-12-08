import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const distDir = path.resolve(import.meta.dirname, '../dist');

async function cleanDist() {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
}

async function buildESM() {
  console.log('Building ES module...');
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/index.js',
    platform: 'neutral',
    sourcemap: true,
    minify: false,
  });
  console.log('ES module built: dist/index.js');
}

async function buildCJS() {
  console.log('Building CommonJS module...');
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'cjs',
    outfile: 'dist/index.cjs',
    platform: 'node',
    sourcemap: true,
    minify: false,
  });
  console.log('CommonJS module built: dist/index.cjs');
}

async function buildTypes() {
  console.log('Generating type declarations...');
  execSync('npx tsc --emitDeclarationOnly --declaration --outDir dist', {
    stdio: 'inherit',
  });
  console.log('Type declarations generated: dist/*.d.ts');
}

async function main() {
  const startTime = Date.now();

  await cleanDist();

  await Promise.all([buildESM(), buildCJS()]);

  await buildTypes();

  const elapsed = Date.now() - startTime;
  console.log(`\nBuild complete in ${elapsed}ms`);
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
