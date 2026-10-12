# http-multipart-boundary-lib

Generates RFC 2046 multipart boundary strings that are guaranteed not to appear as a substring of a given body payload.

```js
import { generateBoundary } from 'http-multipart-boundary-lib';

const body = '------WebKitFormBoundaryabc123\r\nContent-Disposition: form-data\r\n\r\nhello\r\n';
const boundary = generateBoundary(body);
// boundary is a 32-character ASCII string from the RFC 2046 bcharsnospace set,
// and `body.includes(boundary)` is false.
```

## Why this exists

A multipart boundary that appears inside the body payload is a parser-injection bug: an HTTP client or server that splits on the boundary will see phantom parts. Most implementations sidestep this by generating a long random string and hoping entropy alone prevents a collision. That is almost always fine, but it is a probability, not a guarantee. This library closes the gap: it keeps drawing random candidates until it finds one that provably does not occur in the body, and returns that one.

The trade-off is that the body must be available in memory before the boundary is chosen. If the body is being streamed in chunks and the header must be emitted before the first byte, this library cannot help — the guarantee requires inspecting the whole payload.

## Edge cases

Bodies are decoded as UTF-8 with the replacement character (`U+FFFD`) substituted for invalid byte sequences. Because the replacement character is outside the boundary alphabet, invalid UTF-8 in a binary body cannot cause a false collision. `Uint8Array` and `string` bodies are both accepted. The random source is injectable as the second argument to `generateBoundary(body, rng)` so tests can be deterministic; it defaults to `Math.random`.

The RNG contract is the same as `Math.random`: a function returning a float in `[0, 1)`. If the provided RNG is broken (for example, it always returns the same value) and the resulting candidate collides with the body, the generator throws after 1000 attempts rather than looping forever.
