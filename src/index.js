/**
 * Public surface of http-multipart-boundary-lib.
 *
 * Re-exports the boundary generator so callers can do:
 *
 *   import { generateBoundary } from 'http-multipart-boundary-lib';
 *
 * rather than reaching into internal modules.
 */
export { generateBoundary } from './core.js';
