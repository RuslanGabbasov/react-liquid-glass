import { useState, useCallback, useRef } from 'react';
import { Glass, useGlass, GlassConfig } from '../src';

// ---- CSS-only animated background ----
const bgStyles = `
  body {
    margin: 0; padding: 0; overflow: hidden;
    background-color: #0b0c10;
    font-family: 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
    color: #fff;
  }
  .bg-layer {
    position: absolute; width: 200%; height: 200%; top: -50%; left: -50%; z-index: 0;
    background:
      radial-gradient(circle at 35% 35%, rgba(255,0,128,0.9) 0%, transparent 35%),
      radial-gradient(circle at 65% 65%, rgba(0,242,254,0.9) 0%, transparent 35%),
      linear-gradient(rgba(255,255,255,0.12) 2px, transparent 2px),
      linear-gradient(90deg, rgba(255,255,255,0.12) 2px, transparent 2px);
    background-size: 100% 100%, 100% 100%, 50px 50px, 50px 50px;
    animation: spin 20s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(180deg) scale(1.1); }
    100% { transform: rotate(360deg) scale(1); }
  }
  .hint {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    color: rgba(255,255,255,0.25); font-size: 12px; pointer-events: none; z-index: 100;
  }
  .drag-card {
    position: absolute;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .drag-card:active { cursor: grabbing; }
`;

// ---- Custom card using the hook directly ----
function CustomGlassCard({ onDrag }: { onDrag: (e: React.PointerEvent) => void }) {
  const canvasRef = useGlass({ borderWidth: 6, refraction: 18 });

  const style: React.CSSProperties = {
    width: 400,
    height: 260,
    borderRadius: 32,
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.2)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    position: 'relative',
    overflow: 'hidden'
  };

  return (
    <div className="drag-card" style={style} onPointerDown={onDrag}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }} />
      <div style={{ position: 'relative', zIndex: 2, padding: 28 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>useGlass() hook</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8, padding: 20 }}>
          This card uses the low-level <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>useGlass(config)</code> hook.
          Full control over styling and layout.
        </p>
      </div>
    </div>
  );
}

// ---- App ----
export default function App() {
  const [cards, setCards] = useState([
    { id: 1, x: 80, y: 80, w: 380, h: 240, title: 'Glass Component', body: 'Drop-in <Glass> wrapper. Just wrap your content.' },
    { id: 2, x: 520, y: 180, w: 420, h: 280, title: 'useGlass() Hook', body: 'Low-level hook for full layout control. Attach to any canvas.' },
    { id: 3, x: 280, y: 400, w: 360, h: 220, title: 'Configurable', body: 'Tweak cornerRadius, borderWidth, refraction, fresnel, and more.' },
  ]);

  const dragState = useRef<{ id: number | null; offsetX: number; offsetY: number }>({
    id: null, offsetX: 0, offsetY: 0,
  });

  const startDrag = useCallback((id: number, e: React.PointerEvent) => {
    e.stopPropagation();
    const card = cards.find(c => c.id === id);
    if (!card) return;

    dragState.current = {
      id,
      offsetX: e.clientX - card.x,
      offsetY: e.clientY - card.y,
    };

    const onMove = (ev: PointerEvent) => {
      if (dragState.current.id === null) return;
      setCards(prev => prev.map(c =>
        c.id === dragState.current.id
          ? { ...c, x: ev.clientX - dragState.current.offsetX, y: ev.clientY - dragState.current.offsetY }
          : c
      ));
    };
    const onUp = () => { dragState.current.id = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [cards]);

  // Drag for custom card
  const customDragRef = useRef<{ offsetX: number; offsetY: number; el: HTMLElement | null }>({
    offsetX: 0, offsetY: 0, el: null,
  });

  const startCustomDrag = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    customDragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      el: target,
    };

    const onMove = (ev: PointerEvent) => {
      const el = customDragRef.current.el;
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      el.style.left = `${ev.clientX - customDragRef.current.offsetX}px`;
      el.style.top = `${ev.clientY - customDragRef.current.offsetY}px`;
    };
    const onUp = () => { customDragRef.current.el = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  return (
    <>
      <style>{bgStyles}</style>
      <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <div className="bg-layer" />

        {/* Using <Glass> wrapper component */}
        {cards.map(card => (
          <div
            key={card.id}
            className="drag-card"
            onPointerDown={(e) => startDrag(card.id, e)}
            style={{ left: card.x, top: card.y }}
          >
            <Glass config={{
              cornerRadius: 32,
              padding: 20,
              blurAmount: 4,
              shadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 8px 12px rgba(255,255,255,0.1)',
            }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>{card.title}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8 }}>{card.body}</p>
            </Glass>
          </div>
        ))}

        {/* Custom hook usage */}
        <div className="drag-card" style={{ left: 760, top: 440 }} onPointerDown={startCustomDrag}>
          <CustomGlassCard onDrag={() => {}} />
        </div>

        <div className="hint">Drag panels · CSS blur + WebGPU/GL refraction</div>
      </div>
    </>
  );
}
