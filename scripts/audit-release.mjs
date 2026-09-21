import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const pkg = JSON.parse(await read('package.json'));
const versions = JSON.parse(await read('versions.json'));
assert.match(manifest.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
assert.ok(!manifest.id.includes('obsidian'));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.equal(manifest.isDesktopOnly, false);
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
assert.ok((await read('LICENSE')).startsWith('MIT License'));
const js = await read('main.js');
const imports = [...js.matchAll(/require\(["']([^"']+)["']\)/g)].map(match => match[1]);
assert.ok(imports.length > 0 && imports.every(name => name === 'obsidian'), 'Only the host Obsidian API may be external');
assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|eval)\s*\(/.test(js), 'No network or dynamic-code runtime');
assert.ok(Buffer.byteLength(js) < 25 * 1024, 'Keep the JavaScript below the 25 KiB project budget');
const readme = await read('README.md');
for (const match of readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
  assert.ok(!/^https?:/.test(match[1]), 'Screenshots must be bundled with the repository');
  await stat(new URL(`../${match[1]}`, import.meta.url));
}
assert.ok(!readme.includes('local prototype'));
console.log(`Release ${manifest.version} verified: ${Buffer.byteLength(js)} bytes of JavaScript; no runtime dependencies.`);
