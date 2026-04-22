import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { ExportFormat, FontFamily } from './prefs';

const FONT_MAP: Record<FontFamily, string> = {
  hand: 'Caveat',
  serif: 'Lora',
  sans: 'Inter',
};

export async function exportAs(
  text: string,
  format: ExportFormat,
  font: FontFamily,
  size: number,
): Promise<void> {
  let blob: Blob;
  if (format === 'docx') {
    blob = await buildDocxBlob(text, font, size);
  } else {
    const mime = format === 'md' ? 'text/markdown' : 'text/plain';
    blob = new Blob([text], { type: `${mime};charset=utf-8` });
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  triggerDownload(blob, `writedown-${stamp}.${format}`);
}

async function buildDocxBlob(text: string, font: FontFamily, size: number): Promise<Blob> {
  const fontName = FONT_MAP[font];
  const halfPoints = Math.max(16, Math.round(size * 1.5));
  const lines = text.length > 0 ? text.split('\n') : [''];
  const paragraphs = lines.map((line) =>
    new Paragraph({
      children: [
        new TextRun({
          text: line,
          font: fontName,
          size: halfPoints,
        }),
      ],
    }),
  );
  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });
  return await Packer.toBlob(doc);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
