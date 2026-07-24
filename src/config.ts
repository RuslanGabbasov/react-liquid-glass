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
  /** CSS box-shadow string. @default a glass-style shadow */
  shadow: string;
  /** Background color behind the blur. @default rgba(255,255,255,0.04) */
  background: string;
  /** Border color/style. @default 1px solid rgba(255,255,255,0.2) */
  border: string;
  /** Padding in content block */
  padding: number;
}

export const defaultConfig: GlassConfig = {
  cornerRadius: 18,
  borderWidth: 3,
  refraction: 14,
  fresnelPower: 15,
  highlight: 0.15,
  chromaticAberration: 0.135,
  glassAlpha: 0.08,
  innerBrighten: 1.08,
  blurAmount: 4,
  shadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 8px 12px rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  border: '0px solid rgba(255,255,255,0.2)',
  padding: 20
};
