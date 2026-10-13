import Konva from 'konva';
import { annotationSize, FONT } from '../canvas/RoomShapes';
import type { Design } from '../model/types';
import { formatArea, formatLength } from '../model/units';

export type ImageFormat = 'png' | 'jpeg';

interface RenderOptions {
  /** Output width in CSS pixels (before pixelRatio). */
  width: number;
  pixelRatio: number;
  titleBlock: boolean;
}

/**
 * Re-render the plan's grid and content layers into an off-screen stage, framed on the room
 * with a white background and (optionally) a title block with a scale bar. Selection handles,
 * guides and clash markers live on the UI layer and are left out.
 */
export function renderPlan(stage: Konva.Stage, design: Design, opts: RenderOptions): string {
  const { room } = design;
  const fs = annotationSize(room);
  const margin = room.wallThickness + fs * 4.5;
  const worldW = room.width + 2 * margin;
  const worldH = room.depth + 2 * margin;
  const s = opts.width / worldW;
  const titleH = opts.titleBlock ? 96 : 0;
  const width = Math.round(worldW * s);
  const height = Math.round(worldH * s + titleH);

  const container = document.createElement('div');
  const out = new Konva.Stage({ container, width, height });
  try {
    const bg = new Konva.Layer();
    bg.add(new Konva.Rect({ x: 0, y: 0, width, height, fill: '#ffffff' }));
    out.add(bg);

    for (const name of ['grid', 'content']) {
      const layer = stage.findOne(`.${name}`) as Konva.Layer | undefined;
      if (!layer) continue;
      const copy = layer.clone({ x: margin * s, y: margin * s, scaleX: s, scaleY: s, listening: false }) as Konva.Layer;
      out.add(copy);
    }

    if (opts.titleBlock) out.add(titleBlock(design, s, width, height - titleH));
    return out.toDataURL({ mimeType: 'image/png', pixelRatio: opts.pixelRatio });
  } finally {
    out.destroy();
  }
}

function titleBlock(design: Design, s: number, width: number, top: number): Konva.Layer {
  const layer = new Konva.Layer();
  const ink = '#1f2937';
  const pad = 28;
  layer.add(new Konva.Line({ points: [pad, top, width - pad, top], stroke: '#d1d5db', strokeWidth: 1 }));
  layer.add(new Konva.Text({ x: pad, y: top + 20, text: design.name || 'Untitled', fontSize: 22, fontStyle: 'bold', fontFamily: FONT, fill: ink }));
  const { width: W, depth: D } = design.room;
  layer.add(
    new Konva.Text({
      x: pad,
      y: top + 52,
      text: `${formatLength(W)} × ${formatLength(D)}  ·  ceiling ${formatLength(design.room.height)}  ·  ${formatArea(W * D)}  ·  ${design.items.length} items  ·  ${new Date().toLocaleDateString()}`,
      fontSize: 14,
      fontFamily: FONT,
      fill: '#4b5563',
    }),
  );

  // Scale bar: 1 m split into two halves, right-aligned.
  const barLen = 1000 * s;
  const x0 = width - pad - barLen;
  const y0 = top + 36;
  layer.add(new Konva.Rect({ x: x0, y: y0, width: barLen / 2, height: 8, fill: ink, stroke: ink, strokeWidth: 1 }));
  layer.add(new Konva.Rect({ x: x0 + barLen / 2, y: y0, width: barLen / 2, height: 8, fill: '#ffffff', stroke: ink, strokeWidth: 1 }));
  const tick = (x: number, label: string) =>
    layer.add(new Konva.Text({ x: x - 30, y: y0 + 14, width: 60, align: 'center', text: label, fontSize: 12, fontFamily: FONT, fill: ink }));
  tick(x0, '0');
  tick(x0 + barLen / 2, '0.5');
  tick(x0 + barLen, '1 m');
  return layer;
}

/** Flatten a PNG data URL onto white and re-encode (JPEG has no transparency). */
async function toJpeg(pngUrl: string, quality = 0.92): Promise<string> {
  const img = new Image();
  img.src = pngUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', quality);
}

export async function exportImage(stage: Konva.Stage, design: Design, format: ImageFormat) {
  const png = renderPlan(stage, design, { width: 1600, pixelRatio: 2, titleBlock: true });
  const url = format === 'png' ? png : await toJpeg(png);
  download(url, `${slug(design.name)}.${format === 'png' ? 'png' : 'jpg'}`);
}

export function thumbnail(stage: Konva.Stage, design: Design): string | undefined {
  try {
    return renderPlan(stage, design, { width: 220, pixelRatio: 1, titleBlock: false });
  } catch {
    return undefined;
  }
}

export function exportJson(design: Design) {
  const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `${slug(design.name)}.pod.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (name: string) =>
  (name || 'design')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'design';

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
