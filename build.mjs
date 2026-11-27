import fs from 'node:fs';
import * as esbuild from 'esbuild';

const STATIC_FILES = ['index.html', 'style.css', 'three.min.js', 'peerjs.min.js', 'manifest.json'];

fs.mkdirSync('dist', { recursive: true });
fs.rmSync('dist/src', { recursive: true, force: true });

for (const file of STATIC_FILES) {
  fs.copyFileSync(file, `dist/${file}`);
}

await esbuild.build({
  entryPoints: ['game.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  outfile: 'dist/game.js'
});
