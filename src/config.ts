/** Configuration for the glass refraction effect. */
export interface GlassConfig {
  /** Border radius of the glass panel, px. @default 32 */
  cornerRadius: number;
  /** Width of the refractive border zone, px. @default 4 */
  borderWidth: number;
  /** Maximum refraction offset, px. @default 14 */
  refraction: number;
  /** Fresnel exponent — higher = sharper edge. @default 5 */
  fresnelPower: number;
  /** Highlight intensity, 0..1. @default 0.15 */
  highlight: number;
  /** Chromatic aberration (RGB split) strength, 0..0.08. @default 0.035 */
  chromaticAberration: number;
  /** Inner white overlay opacity, 0..1. @default 0.08 */
  glassAlpha: number;
  /** Inner area brightness multiplier. @default 1.08 */
  innerBrighten: number;
  /** CSS blur amount for the body, px. @default 4 */
  blurAmount: number;
}

export const defaultConfig: GlassConfig = {
  cornerRadius: 32,
  borderWidth: 4,
  refraction: 14,
  fresnelPower: 5,
  highlight: 0.15,
  chromaticAberration: 0.035,
  glassAlpha: 0.08,
  innerBrighten: 1.08,
  blurAmount: 4,
};