import { useRef, useEffect, useState, useCallback } from 'react';
import { initGPU, mountEdge, unmountEdge } from './gpu';
import { initWebGL, mountEdgeWebGL, unmountEdgeWebGL } from './gpu-webgl';
import { GlassConfig, defaultConfig, cinematicGlass } from './config';

type RenderBackend = 'webgpu' | 'webgl' | 'css';

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
  const merged = { ...cinematicGlass, ...config };
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
    setCanvasEl(el);
  }, []);
  const [backend, setBackend] = useState<RenderBackend>('css');
  const [gyroAngle, setGyroAngle] = useState(merged.lightAngle);

  // Store config in a ref so we don't trigger re-mounts on gyro changes
  const configRef = useRef(merged);
  configRef.current = merged;

  // Initialize GPU backend (WebGPU first, fallback to WebGL)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Try WebGPU first
      try {
        await initGPU();
        if (!cancelled) setBackend('webgpu');
        return;
      } catch {
        // WebGPU not available, try WebGL
      }

      // Try WebGL fallback
      const success = await initWebGL();
      if (!cancelled) {
        setBackend(success ? 'webgl' : 'css');
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // Gyroscope: follow device orientation on mobile
  useEffect(() => {
    if (!merged.followGyro) return;

    const handler = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const angle = (gamma / 90) * Math.PI * 0.5;
      setGyroAngle(angle);
    };

    // Request permission on iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((permissionState: string) => {
          if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handler);
          }
        })
        .catch(console.warn);
    } else {
      window.addEventListener('deviceorientation', handler);
    }

    return () => window.removeEventListener('deviceorientation', handler);
  }, [merged.followGyro]);

  // Mount/unmount edge canvas — only on mount/unmount, NOT on gyro changes
  useEffect(() => {
    const canvas = canvasEl;
    if (!canvas || backend === 'css') return;

    const parent = canvas.parentElement;
    if (!parent) return;

    // Mount once on mount
    const mount = () => {
      const rect = parent.getBoundingClientRect();
      const cfg = configRef.current;
      if (backend === 'webgpu') {
        mountEdge(canvas, rect.width, rect.height, cfg);
      } else {
        mountEdgeWebGL(canvas, rect.width, rect.height, cfg);
      }
    };

    mount();

    // ResizeObserver for size changes only
    const observer = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect();
      const cfg = configRef.current;
      if (backend === 'webgpu') {
        mountEdge(canvas, rect.width, rect.height, cfg);
      } else {
        mountEdgeWebGL(canvas, rect.width, rect.height, cfg);
      }
    });
    observer.observe(parent);

    return () => {
      observer.disconnect();
      if (backend === 'webgpu') {
        unmountEdge(canvas);
      } else {
        unmountEdgeWebGL(canvas);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEl, backend]);

  const effectiveConfig = {
    ...merged,
    lightAngle: merged.followGyro ? gyroAngle : merged.lightAngle,
  };

  return { canvasRef, backend, effectiveConfig } as const;
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
 * Renders a div with CSS backdrop-filter blur + a GPU refractive edge canvas.
 * Falls back to CSS-only glass on devices without GPU support.
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
  const { canvasRef, backend } = useGlass(merged);

  // Content radius is smaller so the border ring is uniform everywhere
  const contentRadius = Math.max(0, merged.cornerRadius - merged.borderWidth - 1);

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
      {(backend === 'webgpu' || backend === 'webgl') && (
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
      )}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: merged.padding,
          borderRadius: contentRadius,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
