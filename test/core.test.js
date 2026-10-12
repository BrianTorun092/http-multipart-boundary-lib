import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoundary } from '../src/index.js';

/**
 * Deterministic linear congruential generator so every test run produces
 * identical boundary candidates. This is NOT cryptographically secure —
 * it exists only so tests can assert on lengths, alphabets, and the
 * absence of collisions without depending on wall-clock randomness.
 *
 * Returns floats in [0, 1) to match the `Math.random` contract.
 */
function makeFakeRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    // Constants from Numerical Recipes (MINSTD-style) — good enough distribution for tests.
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 0x100000000;
  };
}

test('returns a 32-character ASCII string for a simple body', () => {
  const body = 'hello world';
  const rng = makeFakeRng(1);
  const boundary = generateBoundary(body, rng);
  assert.equal(typeof boundary, 'string');
  assert.equal(boundary.length, 32);
  // RFC 2046 bcharsnospace — no spaces, no control chars, only the whitelisted punctuation.
  assert.match(boundary, /^[A-Za-z0-9'()+_,\-./:]+$/);
});

test('returned boundary does not appear in the body', () => {
  const body = 'Some content with a long-enough payload to search through.';
  const boundary = generateBoundary(body, makeFakeRng(42));
  assert.equal(body.includes(boundary), false);
});

test('returns the same candidate across calls when the RNG is identical', () => {
  const body = 'same body';
  const a = generateBoundary(body, makeFakeRng(7));
  const b = generateBoundary(body, makeFakeRng(7));
  assert.equal(a, b);
});

test('produces different output for different RNG seeds', () => {
  const body = 'same body';
  const a = generateBoundary(body, makeFakeRng(1));
  const b = generateBoundary(body, makeFakeRng(2));
  assert.notEqual(a, b);
});

test('works with an empty body', () => {
  const boundary = generateBoundary('', makeFakeRng(3));
  assert.equal(boundary.length, 32);
});

test('accepts a Uint8Array body', () => {
  const body = new TextEncoder().encode('binary-ish payload bytes');
  const boundary = generateBoundary(body, makeFakeRng(9));
  assert.equal(boundary.length, 32);
  assert.equal(body.includes(new TextEncoder().encode(boundary)), false);
});

test('survives invalid UTF-8 bytes in the body without throwing', () => {
  // 0xFF, 0xFE is not valid UTF-8; TextDecoder will emit U+FFFD.
  const body = new Uint8Array([0xff, 0xfe, 0x41, 0x42]);
  const boundary = generateBoundary(body, makeFakeRng(11));
  assert.equal(boundary.length, 32);
});

test('handles a body that already contains a plausible boundary-like token', () => {
  const body = '----WebKitFormBoundaryABC123' + 'x'.repeat(100);
  const boundary = generateBoundary(body, makeFakeRng(5));
  assert.equal(body.includes(boundary), false);
});

test('throws TypeError on null body', () => {
  assert.throws(() => generateBoundary(null, makeFakeRng(1)), TypeError);
});

test('throws TypeError on undefined body', () => {
  assert.throws(() => generateBoundary(undefined, makeFakeRng(1)), TypeError);
});

test('falls back to Math.random when no RNG is supplied', () => {
  // We cannot assert on the value, but we can assert the shape and the guarantee.
  const boundary = generateBoundary('some body');
  assert.equal(boundary.length, 32);
  assert.match(boundary, /^[A-Za-z0-9'()+_,\-./:]+$/);
});

test('every character of the boundary is drawn from the RFC 2046 bcharsnospace set', () => {
  const allowed = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'()+_,-./:");
  const boundary = generateBoundary('anything', makeFakeRng(99));
  for (const ch of boundary) {
    assert.ok(allowed.has(ch), `unexpected character: ${JSON.stringify(ch)}`);
  }
});

test('throws when the RNG always returns the same candidate that collides', () => {
  // Construct a body that contains the exact candidate the broken RNG will produce.
  // First, figure out what makeCandidate would emit for a constant-zero RNG.
  // Math.floor(0 * 66) === 0, so every character is BOUNDARY_CHARS[0] = 'A'.
  const brokenRng = () => 0;
  const body = 'A'.repeat(32);
  assert.throws(() => generateBoundary(body, brokenRng), /MAX_ATTEMPTS|attempts|RNG/i);
});

import { generateBoundary as directGenerate } from '../src/core.js';
test('the core module also exports generateBoundary under the same name', () => {
  // Sanity check that src/index.js and src/core.js agree on the export.
  assert.equal(typeof directGenerate, 'function');
  assert.equal(directGenerate, generateBoundary);
});
