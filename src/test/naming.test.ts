import { describe, it, expect } from 'vitest';
import {
  MERGED_FILENAME,
  IMAGES_PDF_FILENAME,
  editedFilename,
  splitPartFilename,
  pageImageFilename,
  splitZipFilename,
  imagesZipFilename,
  compressedFilename,
  croppedFilename,
  pagesAddedFilename,
  documentOutputNames,
} from '../engine/naming';

describe('Output naming', () => {
  it('uses the fixed merge and images-to-PDF names from the plan', () => {
    expect(MERGED_FILENAME).toBe('merged.pdf');
    expect(IMAGES_PDF_FILENAME).toBe('converted-images.pdf');
  });

  it('builds <source>-edited.pdf from the source base name', () => {
    expect(editedFilename('report.pdf')).toBe('report-edited.pdf');
    expect(editedFilename('annual-report.2024.pdf')).toBe('annual-report.2024-edited.pdf');
  });

  it('builds zero-padded split part names', () => {
    expect(splitPartFilename('report.pdf', 1, 3)).toBe('report-part-01.pdf');
    expect(splitPartFilename('report.pdf', 9, 3)).toBe('report-part-09.pdf');
    expect(splitPartFilename('report.pdf', 12, 12)).toBe('report-part-12.pdf');
  });

  it('widens split padding beyond two digits only when needed', () => {
    expect(splitPartFilename('report.pdf', 5, 120)).toBe('report-part-005.pdf');
    expect(splitPartFilename('report.pdf', 120, 120)).toBe('report-part-120.pdf');
  });

  it('builds three-digit page image names per format', () => {
    expect(pageImageFilename('report.pdf', 1, 'png')).toBe('report-page-001.png');
    expect(pageImageFilename('report.pdf', 42, 'jpeg')).toBe('report-page-042.jpg');
    expect(pageImageFilename('report.pdf', 7, 'jpeg', 1200)).toBe('report-page-0007.jpg');
  });

  it('builds archive names for multi-file outputs', () => {
    expect(splitZipFilename('report.pdf')).toBe('report-split.zip');
    expect(imagesZipFilename('report.pdf')).toBe('report-images.zip');
  });

  it('names advanced-tool outputs from a safe source base', () => {
    expect(compressedFilename('report.pdf')).toBe('report-compressed.pdf');
    expect(croppedFilename('report.pdf')).toBe('report-cropped.pdf');
    expect(pagesAddedFilename('report.pdf')).toBe('report-pages-added.pdf');
  });

  it('names Word, Markdown, and combined outputs for a whole document', () => {
    expect(documentOutputNames('report.pdf', { mode: 'all' })).toEqual({
      docx: 'report.docx',
      markdown: 'report.md',
      zip: 'report-documents.zip',
    });
  });

  it('turns an engine range into one-based page numbers in output names', () => {
    expect(
      documentOutputNames('report.pdf', {
        mode: 'range',
        startIndex: 1,
        endIndexExclusive: 4,
      }),
    ).toEqual({
      docx: 'report-pages-2-4.docx',
      markdown: 'report-pages-2-4.md',
      zip: 'report-pages-2-4-documents.zip',
    });

    expect(
      documentOutputNames('report.pdf', {
        mode: 'range',
        startIndex: 0,
        endIndexExclusive: 1,
      }).markdown,
    ).toBe('report-pages-1-1.md');
  });

  it('sanitises hostile source names before building document outputs', () => {
    expect(documentOutputNames('../../etc/passwd.pdf', { mode: 'all' }).docx).toBe(
      '.._.._etc_passwd.docx',
    );
    expect(documentOutputNames('???', { mode: 'all' }).zip).toBe('document-documents.zip');
  });

  it('sanitises hostile source names before building outputs', () => {
    expect(editedFilename('../../etc/passwd.pdf')).toBe('.._.._etc_passwd-edited.pdf');
    expect(pageImageFilename('a<b>c.pdf', 1, 'png')).toBe('a_b_c-page-001.png');
  });

  it('falls back to a default base name for unusable source names', () => {
    expect(editedFilename('')).toBe('document-edited.pdf');
    expect(splitPartFilename('???', 1, 1)).toBe('document-part-01.pdf');
  });
});
