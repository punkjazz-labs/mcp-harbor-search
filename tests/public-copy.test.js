// Public copy (README, MCP Registry server.json, package.json) must not carry a street or mailing address,
// or say who runs the project and how. Built from parts so this file does not match itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BANNED = new RegExp(['if' + 'za', 'silicon' + '\\s+oasis', 'postal' + '\\s*address', '\\bp\\.?\\s?o\\.?\\s+' + 'box\\b', '342' + '001',
  'operated' + '\\s+by', '\\brun' + '\\s+by\\b', 'built' + '\\s+by', 'maintained' + '\\s+by', '©\\s*punk' + 'jazz', 'spo' + 'ne\\s+fzco', 'simo' + 'ne'].join('|'), 'i');

test('README, server.json and package.json carry no address or operator details', () => {
  for (const f of ['README.md', 'server.json', 'package.json']) {
    const m = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').match(BANNED);
    assert.equal(m?.[0] ?? null, null, f);
  }
});
