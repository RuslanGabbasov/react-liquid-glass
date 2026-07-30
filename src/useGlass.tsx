import { useRef, useEffect, useCallback } from 'react';
import { initGPU, mountEdge, unmountEdge } from './gpu';
import { GlassConfig, defaultConfig } from './config';

/**
 * Hook to apply the Liquid Glass effect to any container element.
 *
 * Returns a ref to attach to the **canvas** overlay element.
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

  useEffect(() => {
    initGPU().catch(console.error);
  }, []);

  // Use ResizeObserver to track container size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect();
      mountEdge(canvas, rect.width, rect.height, merged);
    });
    observer.observe(parent);
    observer.observe(parent);

    return () => {
      observer.disconnect();
      unmountEdge(canvas);
    };
  }, [canvasRef.current]);

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

  // Content radius = outer radius minus border width for uniform border
  const contentRadius = Math.max(0, merged.cornerRadius - merged.borderWidth);

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
          borderRadius: merged.cornerRadius,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, borderRadius: contentRadius, padding: merged.padding }}>{children}</div>
    </div>
  );
}
