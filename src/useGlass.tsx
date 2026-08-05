import { useRef, useEffect, useState, useCallback } from 'react';
import { initGPU, mountEdge, unmountEdge } from './gpu';
import { initWebGL, mountEdgeWebGL, unmountEdgeWebGL } from './gpu-webgl';
import { GlassConfig, defaultConfig, cinematicGlass } from './config';

type RenderBackend = 'webgpu' | 'webgl' | 'css';

export function useGlass(config?: Partial<GlassConfig>) {
  const merged = { ...cinematicGlass, ...config };
  const [backend, setBackend] = useState<RenderBackend>('css');
  const [gyroAngle, setGyroAngle] = useState(merged.lightAngle);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(false);
  const configRef = useRef(merged);
  configRef.current = merged;
  const gyroRef = useRef(gyroAngle);
  gyroRef.current = gyroAngle;

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
  }, []);

  // Init backend — FORCE WebGL for testing (skip WebGPU)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await initWebGL();
      if (!cancelled) setBackend(ok ? 'webgl' : 'css');
    })();
    return () => { cancelled = true; };
  }, []);

  // Mount — single effect, retry with rAF until canvas exists and has size
  useEffect(() => {
    if (backend === 'css') return;
    if (mountedRef.current) return;

    let rafId = 0;

    const tryMount = () => {
      if (mountedRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafId = requestAnimationFrame(tryMount); return; }
      const parent = canvas.parentElement;
      if (!parent) { rafId = requestAnimationFrame(tryMount); return; }
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) { rafId = requestAnimationFrame(tryMount); return; }

      // Pass config with gyro-updated lightAngle
      const cfg = { ...configRef.current, lightAngle: gyroRef.current };
      if (backend === 'webgpu') {
        mountEdge(canvas, rect.width, rect.height, cfg);
      } else {
        mountEdgeWebGL(canvas, rect.width, rect.height, cfg);
      }
      mountedRef.current = true;
    };

    tryMount();
    return () => cancelAnimationFrame(rafId);
  }, [backend]);

  // Update config when gyro changes
  useEffect(() => {
    if (!mountedRef.current) return;
    const cfg = { ...configRef.current, lightAngle: gyroAngle };
    configRef.current = cfg;
    // Update currentConfig in gpu-webgl
    (window as any).__glassGyroConfig = cfg;
  }, [gyroAngle]);

  // Gyroscope
  useEffect(() => {
    if (!merged.followGyro) return;
    const handler = (e: DeviceOrientationEvent) => {
      const g = e.gamma ?? 0, b = e.beta ?? 0;
      setGyroAngle(Math.atan2(Math.max(-1, Math.min(1, b/25)), Math.max(-1, Math.min(1, g/25))));
    };
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission().then((s: string) => { if (s === 'granted') window.addEventListener('deviceorientation', handler); }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', handler);
    }
    return () => window.removeEventListener('deviceorientation', handler);
  }, [merged.followGyro]);

  return { canvasRef: setCanvasRef, backend, effectiveConfig: { ...merged, lightAngle: merged.followGyro ? gyroAngle : merged.lightAngle } } as const;
}

export interface GlassProps { children: React.ReactNode; config?: Partial<GlassConfig>; style?: React.CSSProperties; className?: string; }

export function Glass({ children, config, style, className }: GlassProps) {
  const m = { ...defaultConfig, ...config };
  const { canvasRef, backend } = useGlass(m);
  const cr = Math.max(0, m.cornerRadius - m.borderWidth - 1);
  return (
    <div className={className} style={{ background: m.background, borderRadius: m.cornerRadius, border: m.border, boxShadow: m.shadow, position: 'relative', overflow: 'hidden', ...style }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, display: backend === 'css' ? 'none' : 'block' }} />
      <div style={{ position: 'relative', zIndex: 2, padding: m.padding, borderRadius: cr, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}