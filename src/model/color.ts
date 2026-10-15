// Small hex-colour helpers (#rrggbb only).

export const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Move a colour towards white (amount > 0) or black (amount < 0); amount in [-1, 1]. */
export function shade(color: string, amount: number): string {
  if (!isHex(color)) return color;
  const n = parseInt(color.slice(1), 16);
  const target = amount >= 0 ? 255 : 0;
  const a = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * a);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export const ROOM_COLORS = { wall: '#f3f1ec', floor: '#e6dac6' };
