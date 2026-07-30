import { useRef, useEffect, useState } from 'react';
import { initGPU, mountEdge, unmountEdge } from './gpu';
import { GlassConfig, defaultConfig } from './config';

/**
 * Hook to apply the Liquid Glass effect to any container element.
 *
 * Returns a ref to attach to the **canvas** overlay element.
 *
 * On mobile devices, the specular highlight automatically follows
 * the device orientation via gyroscope (can be disabled with `followGyro: false`).
 *
 * @example
 * ```tsx
 * function MyCard() {
 *   const ref = useGlass({ borderWidth: 6 });
 *   return (
 *     <div className="glass-container">
 *       <canvas ref={ref} />
 *       <div>Content</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useGlass(config?: Partial<GlassConfig>) {
  const merged = { ...defaultConfig, ...config };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gyroAngle, setGyroAngle] = useState(merged.lightAngle);

  useEffect(() => {
    initGPU().catch(console.error);
  }, []);

  // Gyroscope: follow device orientation on mobile
  useEffect(() => {
    if (!merged.followGyro) return;

    // Check if gyroscope is available
    if (typeof DeviceOrientationEvent !== 'undefined') {
      const handler = (e: DeviceOrientationEvent) => {
        // gamma: left-right tilt (-90..90)
        // Map gamma to light angle: -45°..45° range around default
        const gamma = e.gamma ?? 0;
        const angle = (gamma / 90) * Math.PI * 0.5; // ±90°
        setGyroAngle(angle);
      };
      window.addEventListener('deviceorientation', handler);
      return () => window.removeEventListener('deviceorientation', handler);
    }
  }, [merged.followGyro]);

  // Use gyro angle if following, otherwise config value
  const effectiveConfig = {
    ...merged,
    lightAngle: merged.followGyro ? gyroAngle : merged.lightAngle,
  };

  // Use ResizeObserver to track container size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect();
      mountEdge(canvas, rect.width, rect.height, effectiveConfig);
    });
    observer.observe(parent);

    return () => {
      observer.disconnect();
      unmountEdge(canvas);
    };
  }, [canvasRef.current, effectiveConfig.lightAngle]);

  return canvasRef;
}

/**
 * Props for the `<Glass>` wrapper component.
 */
export interface GlassProps {
  children: React.ReactNode;
  config?: Partial<GlassConfig>;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Convenience wrapper component that applies Liquid Glass to a container.
 *
 * Renders a div with CSS backdrop-filter blur + a WebGPU refractive edge canvas.
 *
 * @example
 * ```tsx
 * <Glass config={{ blurAmount: 6 }}>
 *   <h2>Hello Glass</h2>
 * </Glass>
 * ```
 */
export function Glass({ children, config, style, className }: GlassProps) {
  const merged = { ...defaultConfig, ...config };
  const canvasRef = useGlass(merged);

  return (
    <div
      className={className}
      style={{
        backdropFilter: `blur(${merged.blurAmount}px)`,
        WebkitBackdropFilter: `blur(${merged.blurAmount}px)`,
        background: merged.background,
        borderRadius: merged.cornerRadius,
        border: merged.border,
        boxShadow: merged.shadow,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, padding: merged.padding }}>
        {children}
      </div>
    </div>
  );
}
