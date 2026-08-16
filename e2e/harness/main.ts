/**
 * Harness entry point. Served by the Vite dev server at
 * `/e2e/harness/index.html` and never included in the production build, whose
 * only input is the root `index.html`.
 */

import * as advanced from '../../src/engine/advancedPdfEngine';
import * as core from '../../src/engine/pdfEngine';
import * as renderer from '../../src/engine/pdfRenderer';
import * as errors from '../../src/engine/errors';
import type { EngineApi } from './api';

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  // Chunked because spreading a multi-megabyte array into String.fromCharCode
  // overflows the argument limit.
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

const api: EngineApi = { advanced, core, renderer, errors, fromBase64, toBase64 };
window.engineApi = api;

document.body.dataset.harness = 'ready';
