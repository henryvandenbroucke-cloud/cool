import { AU_KM, AU_PER_YR_IN_KM_S, EARTH_MASS_SUN, SOLAR_MASS_KG } from '../simulation/constants';

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** 1.23 × 10²⁴ style scientific notation (plain digits for moderate magnitudes). */
export function sci(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e5) return trim(value.toPrecision(digits));
  const exp = Math.floor(Math.log10(abs));
  const mant = value / Math.pow(10, exp);
  const sup = String(exp)
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');
  return `${trim(mant.toPrecision(digits))} × 10${sup}`;
}

function trim(s: string): string {
  if (!s.includes('.') || s.includes('e')) return s;
  return s.replace(/\.?0+$/, '');
}

export function formatNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e5 || (abs > 0 && abs < 1e-3)) return sci(v, digits);
  return v.toLocaleString('en-US', { maximumFractionDigits: abs < 10 ? digits : abs < 1000 ? 1 : 0 });
}

/** Mass in the most natural unit for the body, plus kilograms. */
export function formatMass(massSun: number): { primary: string; kg: string } {
  const kg = sci(massSun * SOLAR_MASS_KG, 3) + ' kg';
  if (massSun >= 0.01) return { primary: `${formatNumber(massSun, 3)} M☉`, kg };
  return { primary: `${formatNumber(massSun / EARTH_MASS_SUN, 3)} M⊕`, kg };
}

export function formatDistanceAu(au: number): string {
  if (!Number.isFinite(au)) return '—';
  if (au < 0.01) return `${formatNumber(au * AU_KM, 3)} km`;
  return `${formatNumber(au, 3)} AU`;
}

export function formatSpeed(auPerYr: number): string {
  return `${formatNumber(auPerYr * AU_PER_YR_IN_KM_S, 3)} km/s`;
}

export function formatRadiusKm(au: number): string {
  return `${formatNumber(au * AU_KM, 4)} km`;
}

/** Simulated elapsed time: days for short spans, years otherwise. */
export function formatSimTime(years: number): string {
  if (years < 1 / 365.25) return `${(years * 365.25 * 24).toFixed(1)} h`;
  if (years < 2) return `${(years * 365.25).toFixed(1)} days`;
  if (years < 1000) return `${years.toFixed(2)} yr`;
  return `${sci(years, 4)} yr`;
}

/** Simulation speed (simulated years per real second) in friendly words. */
export function formatRate(yearsPerSecond: number): string {
  const days = yearsPerSecond * 365.25;
  if (days < 1) return `${(days * 24).toFixed(days * 24 < 10 ? 1 : 0)} h / s`;
  if (days < 60) return `${days.toFixed(days < 10 ? 1 : 0)} days / s`;
  return `${yearsPerSecond.toFixed(yearsPerSecond < 10 ? 2 : 1)} yr / s`;
}
