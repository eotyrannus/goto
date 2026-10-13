// Internal unit is the millimetre; the UI talks in centimetres and metres.

export const mmToCm = (mm: number) => Math.round(mm) / 10;
export const cmToMm = (cm: number) => Math.round(cm * 10);

const trim = (n: number, digits: number) => Number(n.toFixed(digits)).toString();

/** "2.40 m" for room-scale lengths, "45 cm" for smaller ones. */
export function formatLength(mm: number): string {
  if (Math.abs(mm) >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${trim(mm / 10, 1)} cm`;
}

export function formatArea(mm2: number): string {
  return `${(mm2 / 1e6).toFixed(2)} m²`;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
