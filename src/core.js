/**
 * Core boundary generator for http-multipart-boundary-lib.
 *
 * The goal: produce a string suitable for use as an HTTP multipart
 * boundary — RFC 2046 §5.1.1 — that is guaranteed not to occur as a
 * substring of a given body payload. The body can be text, binary, or
 * mixed; the only encoding limitation is that the generated boundary
 * itself must be an ASCII string that survives HTTP transport unchanged.
 *
 * Strategy in one sentence: keep drawing random ASCII boundary candidates
 * (one candidate per call to `rng`), and return the first whose string
 * representation does not appear in the body's byte sequence.
 *
 * Why randomness instead of a deterministic counter like "----body12345"?
 * A deterministic scheme derived from body content would itself be a
 * substring of the body in degenerate cases — e.g. an attacker or a
 * trivial input that happens to contain the same bytes we compute.
 * Random candidates sidestep this entirely.
 *
 * Why UTF-8 the body into a string rather than hashing it? Hashing loses
 * positional information: a hash collision with the candidate string
 * would be vanishingly unlikely but not impossible to reason about, and
 * we want a hard guarantee. Direct substring search over the UTF-8-decoded
 * body gives us exactly the property we claim: the returned boundary does
 * not appear in the body. JavaScript's `String.prototype.includes` is a
 * literal code-unit search, so it behaves deterministically on whatever
 * the bytes decode to, including replacement characters for invalid
 * sequences. The important invariant is that candidate generation and
 * body search live in the same string space.
 *
 * The random source is injected rather than read from `crypto` so the
 * test suite is fully deterministic without needing to mock global APIs.
 */

/**
 * RFC 2046 §5.1.1 allows boundary characters from the set
 * `bchars` = `bcharsnospace` | SPACE
 * `bcharsnospace` = DIGIT | ALPHA | "'" | "(" | ")" | "+" |
 *                  "_" | "," | "-" | "." | "/" | ":" | "="
 *
 * We deliberately use the smaller `bcharsnospace` set (no spaces) so
 * that the boundary can be placed at the end of a line without risk of
 * trailing-whitespace confusion in parsers that trim CRLF lines.
 */
const BOUNDARY_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "abcdefghijklmnopqrstuvwxyz" +
  "0123456789" +
  "'()+_,-./:";

/**
 * RFC 2046 caps a boundary at 70 characters; a leading "--" is already
 * required by the multipart syntax on the wire. We generate 32 random
 * characters, well under the cap, which gives ~192 bits of entropy from
 * a 66-character alphabet — comfortably beyond any practical brute-force
 * attempt to guess a boundary and smuggle content.
 */
const BOUNDARY_LENGTH = 32;

/**
 * Hard stop on attempts. With 32 chars drawn from a 66-symbol alphabet
 * the chance of any single candidate colliding with a given body is
 * negligible; 1000 attempts exists only to fail loudly on a broken RNG
 * (e.g. one that always returns zero) rather than spinning forever.
 */
const MAX_ATTEMPTS = 1000;

/**
 * Convert a body of arbitrary bytes into a string suitable for substring
 * search against ASCII boundary candidates.
 *
 * TextDecoder with `{ fatal: false }` (the default) maps invalid byte
 * sequences to U+FFFD, the Unicode replacement character. That character
 * is outside the boundary alphabet, so it can never be part of a
 * candidate — invalid bytes therefore cannot cause a false collision.
 * The important property is that both the body and the candidate live in
 * the same JavaScript string space so `includes` is meaningful.
 *
 * @param {string|Uint8Array} body
 * @returns {string}
 */
function bodyToString(body) {
  if (typeof body === 'string') return body;
  // Shared global; constructing one per call is cheap and avoids state.
  return new TextDecoder('utf-8', { fatal: false }).decode(body);
}

/**
 * Build one random boundary candidate using the provided RNG.
 *
 * The RNG contract mirrors `Math.random`: a function returning a float
 * in [0, 1). We index into BOUNDARY_CHARS via `Math.floor(n * len)`;
 * because `n < 1` strictly, the product is strictly less than `len`,
 * so the floored index is always in range.
 *
 * @param {() => number} rng
 * @returns {string}
 */
function makeCandidate(rng) {
  let out = '';
  for (let i = 0; i < BOUNDARY_LENGTH; i++) {
    out += BOUNDARY_CHARS[Math.floor(rng() * BOUNDARY_CHARS.length)];
  }
  return out;
}

/**
 * Generate a multipart boundary string guaranteed not to appear as a
 * substring of `body`.
 *
 * @param {string|Uint8Array} body - The payload the boundary must not collide with.
 * @param {() => number} [rng=Math.random] - Source of randomness in [0, 1). Injected for deterministic tests.
 * @returns {string} A boundary of 32 characters from the RFC 2046 `bcharsnospace` set.
 * @throws {Error} If no non-colliding candidate is found within MAX_ATTEMPTS attempts — in practice this means the RNG is broken.
 */
export function generateBoundary(body, rng = Math.random) {
  if (body === null || body === undefined) {
    throw new TypeError('body must be a string or Uint8Array');
  }
  const text = bodyToString(body);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = makeCandidate(rng);
    if (!text.includes(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'generateBoundary: could not find a non-colliding boundary within ' +
      MAX_ATTEMPTS +
      ' attempts; check the RNG'
  );
}
