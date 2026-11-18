/**
 * tire.js - pure tire size maths. No DOM, no dependencies.
 * Works in browsers (ES module) and Node 16+.
 *
 * Core formula (metric sizes, e.g. 205/55 R16):
 *   sidewall_mm = width * aspect / 100
 *   diameter_mm = rim_in * 25.4 + 2 * sidewall_mm
 */

export const MM_PER_INCH = 25.4;
export const KM_PER_MILE = 1.609344;
/** Commonly recommended maximum overall-diameter difference, in percent. */
export const DEFAULT_TOLERANCE_PCT = 3;

export const STANDARD_WIDTHS = [
  125, 135, 145, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325, 335, 345, 355,
];
export const STANDARD_ASPECTS = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
export const STANDARD_RIMS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

const round = (v, d = 1) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};

/**
 * Parse a tire size string.
 * Supported: "205/55R16", "205/55 R16", "205/55-16", "205 55 16", "LT265/70R17",
 * "P215/65R15", "225/45ZR17", "205/55R16 91V" (load/speed suffix ignored),
 * flotation "31x10.50R15", "31x10.5 R15", "33X12.50R20".
 * @param {string} input
 * @returns {null | {type:'metric', prefix:string, width:number, aspect:number, rim:number}
 *   | {type:'flotation', prefix:string, diameterIn:number, widthIn:number, rim:number}}
 */
export function parseTireSize(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/,/g, '.').replace(/\s+/g, ' ').toUpperCase();
  if (!s) return null;

  const flot = s.match(/^(LT)?\s*(\d{2}(?:\.\d+)?)\s*[X×]\s*(\d{1,2}(?:\.\d+)?)\s*(?:R|-|\s)\s*(\d{2}(?:\.\d+)?)(?:\s.*)?$/);
  if (flot) {
    const diameterIn = parseFloat(flot[2]);
    const widthIn = parseFloat(flot[3]);
    const rim = parseFloat(flot[4]);
    if (diameterIn > rim && widthIn > 0 && widthIn < 25 && rim >= 10 && rim <= 30) {
      return { type: 'flotation', prefix: flot[1] || '', diameterIn, widthIn, rim };
    }
    return null;
  }

  const m = s.match(/^(LT|P|ST|C)?\s*(\d{3})\s*(?:\/|\s)\s*(\d{2})\s*(?:Z?R|ZR|-|\s)\s*(\d{2}(?:\.\d)?)(?:\s.*)?$/);
  if (!m) return null;
  const width = parseInt(m[2], 10);
  const aspect = parseInt(m[3], 10);
  const rim = parseFloat(m[4]);
  if (width < 80 || width > 500 || aspect < 15 || aspect > 95 || rim < 10 || rim > 30) return null;
  return { type: 'metric', prefix: m[1] || '', width, aspect, rim };
}

/** Format a parsed size back to a canonical string. */
export function formatTireSize(size) {
  if (!size) return '';
  if (size.type === 'flotation') {
    const w = size.widthIn.toFixed(2);
    return `${size.prefix}${size.diameterIn}x${w}R${size.rim}`;
  }
  return `${size.prefix}${size.width}/${size.aspect} R${size.rim}`;
}

/**
 * Compute all dimensions. Accepts a string or a parsed size object.
 * @returns {null | object} dimensions in mm / in, revolutions per km / mile
 */
export function tireDimensions(sizeOrString) {
  const size = typeof sizeOrString === 'string' ? parseTireSize(sizeOrString) : sizeOrString;
  if (!size) return null;
  const rimMm = size.rim * MM_PER_INCH;
  let diameterMm, widthMm, sidewallMm;
  if (size.type === 'flotation') {
    diameterMm = size.diameterIn * MM_PER_INCH;
    widthMm = size.widthIn * MM_PER_INCH;
    sidewallMm = (diameterMm - rimMm) / 2;
  } else {
    widthMm = size.width;
    sidewallMm = (size.width * size.aspect) / 100;
    diameterMm = rimMm + 2 * sidewallMm;
  }
  const circumferenceMm = Math.PI * diameterMm;
  return {
    size: formatTireSize(size),
    widthMm: round(widthMm, 1),
    sidewallMm: round(sidewallMm, 1),
    rimMm: round(rimMm, 1),
    rimIn: size.rim,
    diameterMm: round(diameterMm, 1),
    diameterIn: round(diameterMm / MM_PER_INCH, 2),
    sidewallIn: round(sidewallMm / MM_PER_INCH, 2),
    widthIn: round(widthMm / MM_PER_INCH, 2),
    circumferenceMm: round(circumferenceMm, 1),
    circumferenceIn: round(circumferenceMm / MM_PER_INCH, 2),
    revsPerKm: round(1e6 / circumferenceMm, 1),
    revsPerMile: round((KM_PER_MILE * 1e6) / circumferenceMm, 1),
  };
}

/**
 * Compare an old (reference) tire with a new one.
 * The speedometer is assumed calibrated for the OLD size:
 *   actual = indicated * newDiameter / oldDiameter
 * @param {string|object} oldSize
 * @param {string|object} newSize
 * @param {{unit?:'kmh'|'mph', speeds?:number[], tolerancePct?:number}} [opts]
 */
export function compareTires(oldSize, newSize, opts = {}) {
  const unit = opts.unit === 'mph' ? 'mph' : 'kmh';
  const tolerancePct = opts.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
  const speeds = opts.speeds ?? (unit === 'mph' ? [20, 30, 40, 50, 60, 70, 80] : [30, 50, 60, 80, 90, 100, 110, 120, 130]);
  const a = tireDimensions(oldSize);
  const b = tireDimensions(newSize);
  if (!a || !b) return null;
  const ratio = b.diameterMm / a.diameterMm;
  const diffPct = (ratio - 1) * 100;
  const speedometer = speeds.map((indicated) => {
    const actual = indicated * ratio;
    return { indicated, actual: round(actual, 1), diff: round(actual - indicated, 1) };
  });
  return {
    old: a,
    new: b,
    diameterDiffMm: round(b.diameterMm - a.diameterMm, 1),
    diameterDiffPct: round(diffPct, 2),
    sidewallDiffMm: round(b.sidewallMm - a.sidewallMm, 1),
    widthDiffMm: round(b.widthMm - a.widthMm, 1),
    circumferenceDiffMm: round(b.circumferenceMm - a.circumferenceMm, 1),
    revsPerKmDiffPct: round((b.revsPerKm / a.revsPerKm - 1) * 100, 2),
    unit,
    tolerancePct,
    exceedsTolerance: Math.abs(diffPct) > tolerancePct,
    // new tire is larger -> speedometer under-reads (real speed higher than shown)
    speedometerReads: Math.abs(diffPct) < 0.005 ? 'accurate' : diffPct > 0 ? 'low' : 'high',
    speedometer,
  };
}

/**
 * Suggest alternative sizes ("plus / minus sizing") with the rim changed by
 * rimSteps (default -1 and +1 inch) and overall diameter within tolerance of the original.
 * Aspect ratios and widths come from common standard values; results are
 * candidates for checking against manufacturer data, not fitment guarantees.
 * @param {string|object} sizeOrString
 * @param {{tolerancePct?:number, rimSteps?:number[], widthRange?:[number,number], limitPerRim?:number}} [opts]
 * @returns {Array<{size:string, rim:number, width:number, aspect:number, diameterMm:number, diffMm:number, diffPct:number, rimStep:number}>}
 */
export function suggestPlusSizes(sizeOrString, opts = {}) {
  const size = typeof sizeOrString === 'string' ? parseTireSize(sizeOrString) : sizeOrString;
  if (!size) return [];
  const base = tireDimensions(size);
  const tol = opts.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
  const steps = opts.rimSteps ?? [-1, 1];
  const baseWidth = base.widthMm;
  const [minW, maxW] = opts.widthRange ?? [baseWidth - 20, baseWidth + 30];
  const limit = opts.limitPerRim ?? 4;
  const out = [];
  for (const step of steps) {
    const rim = size.rim + step;
    if (rim < 12 || rim > 24 || step === 0) continue;
    const found = [];
    for (const width of STANDARD_WIDTHS) {
      if (width < minW || width > maxW) continue;
      // best aspect for this width = closest diameter
      let best = null;
      for (const aspect of STANDARD_ASPECTS) {
        const d = rim * MM_PER_INCH + (2 * width * aspect) / 100;
        const pct = (d / base.diameterMm - 1) * 100;
        if (Math.abs(pct) <= tol && (!best || Math.abs(pct) < Math.abs(best.pct))) best = { aspect, d, pct };
      }
      if (best) {
        found.push({
          size: `${width}/${best.aspect} R${rim}`,
          rim,
          width,
          aspect: best.aspect,
          diameterMm: round(best.d, 1),
          diffMm: round(best.d - base.diameterMm, 1),
          diffPct: round(best.pct, 2),
          rimStep: step,
        });
      }
    }
    // closest diameter first; ties -> width closest to original
    found.sort((x, y) => Math.abs(x.diffPct) - Math.abs(y.diffPct) || Math.abs(x.width - baseWidth) - Math.abs(y.width - baseWidth));
    out.push(...found.slice(0, limit));
  }
  return out;
}
