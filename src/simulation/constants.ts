/**
 * Simulation unit system
 * ----------------------
 *   distance : astronomical unit (AU)
 *   mass     : solar mass (M☉)
 *   time     : Julian year (yr)
 *
 * In these units Newton's constant is exactly 4π² AU³ / (M☉ · yr²), so a
 * massless body on a 1 AU circular orbit around 1 M☉ has a period of 1 yr.
 *
 * Rendering: one AU maps to RENDER_SCALE Three.js scene units. Every
 * position the renderer shows is `simPosition * RENDER_SCALE`; nothing is
 * moved for visual reasons.
 */
export const G = 4 * Math.PI * Math.PI;

export const RENDER_SCALE = 100;

export const AU_KM = 1.495978707e8;
export const AU_M = AU_KM * 1000;
export const YEAR_S = 365.25 * 86400;
export const DAY_YR = 1 / 365.25;
export const HOUR_YR = DAY_YR / 24;
export const SOLAR_MASS_KG = 1.98847e30;
export const EARTH_MASS_SUN = 5.9722e24 / SOLAR_MASS_KG;
export const JUPITER_MASS_SUN = 1.89813e27 / SOLAR_MASS_KG;
export const EARTH_RADIUS_AU = 6371 / AU_KM;
export const JUPITER_RADIUS_AU = 69911 / AU_KM;
export const SUN_RADIUS_AU = 695700 / AU_KM;
/** 1 AU/yr expressed in km/s (≈ 4.74). */
export const AU_PER_YR_IN_KM_S = AU_KM / YEAR_S;
/** Speed of light in AU/yr — used only for the informational Schwarzschild radius. */
export const C_AU_PER_YR = 299792.458 / AU_PER_YR_IN_KM_S;

/** Default fixed integration step: 0.1 day. */
export const DEFAULT_BASE_DT = 0.1 * DAY_YR;
/** Plummer softening length (AU). Small compared to any body radius. */
export const DEFAULT_SOFTENING = 1e-6;
/** Upper bound on adaptive substeps inside one fixed step. */
export const MAX_SUBSTEPS = 48;
/**
 * Work budget per rendered frame, measured in pair interactions
 * (substeps × N(N−1)/2). When the requested time speed would exceed it, the
 * simulation runs slower than requested instead of taking larger steps.
 */
export const DEFAULT_PAIR_BUDGET = 700_000;
export const MAX_BODIES = 400;
