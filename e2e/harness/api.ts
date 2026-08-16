/**
 * Type contract shared by the harness page and the specs that drive it.
 *
 * The harness hands the engine modules to the browser window so a spec can
 * call them with a real canvas, a real pdf.js worker, and real image codecs
 * behind them. Importing the modules only as types here keeps this file free
 * of runtime imports, so specs stay Node-side while the values live in the page.
 */

import type * as advanced from '../../src/engine/advancedPdfEngine';
import type * as core from '../../src/engine/pdfEngine';
import type * as renderer from '../../src/engine/pdfRenderer';
import type * as errors from '../../src/engine/errors';

export type EngineApi = {
  advanced: typeof advanced;
  core: typeof core;
  renderer: typeof renderer;
  errors: typeof errors;
  /** Decodes a base64 payload sent from the test process. */
  fromBase64: (value: string) => Uint8Array;
  /** Encodes bytes for the trip back to the test process. */
  toBase64: (bytes: Uint8Array) => string;
};

declare global {
  interface Window {
    engineApi?: EngineApi;
  }
}
