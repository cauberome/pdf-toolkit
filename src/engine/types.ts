export type PdfSource = {
  id: string;
  name: string;
  bytes: Uint8Array;
};

export type PageRange = {
  start: number;
  end: number;
};

export type PageThumbnail = {
  pageNumber: number; // 1-based
  pageIndex: number;  // 0-based
  dataUrl: string;
  width: number;
  height: number;
};

export type SplitGroup = {
  groupIndex: number;
  name: string;
  pages: number[]; // 1-based user facing page numbers
};

export type SplitParseResult = {
  isValid: boolean;
  error?: string;
  groups: number[][]; // 0-based page indexes for engine
  userGroups: number[][]; // 1-based page numbers for display
};

export type ProcessingStatus = 'idle' | 'loading' | 'rendering' | 'processing' | 'success' | 'error';

export interface ProcessingProgress {
  status: ProcessingStatus;
  percentage: number;
  message: string;
  error?: string;
}

export type ImageFormat = 'png' | 'jpeg';

export type CompressionPreset = 'quality' | 'balanced' | 'smallest';

export type CompressionOptions =
  | { mode: 'auto'; preset: CompressionPreset }
  | { mode: 'target'; targetBytes: number };

export type CompressionResult = {
  bytes: Uint8Array;
  originalBytes: number;
  outputBytes: number;
  attempts: number;
  targetReached: boolean | null;
  rasterized: boolean;
};

export type CropMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type BlankPageSize = 'match' | 'a4' | 'letter';

export type PageAddition =
  | { kind: 'blank'; count: number; size: BlankPageSize }
  | { kind: 'pdf'; source: PdfSource }
  | { kind: 'images'; files: File[] };
