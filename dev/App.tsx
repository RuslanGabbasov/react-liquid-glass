import { useState, useCallback } from 'react';
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
  .hint { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.25); font-size: 12px; pointer-events: none; z-index: 100; }
`;

// ---- Custom card using the hook directly ----
function CustomGlassCard() {
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
    overflow: 'hidden',
  };

  return (
    <div style={style}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, borderRadius: 32 }} />
      <div style={{ position: 'relative', zIndex: 2, padding: 28 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>useGlass() hook</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8 }}>
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

  const dragRef = { current: null as number | null };
  const offRef = { x: 0, y: 0 };

  const startDrag = useCallback((id: number, e: React.PointerEvent) => {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    dragRef.current = id;
    offRef.x = e.clientX - card.x;
    offRef.y = e.clientY - card.y;

    const onMove = (ev: PointerEvent) => {
      if (dragRef.current === null) return;
      setCards(prev => prev.map(c => c.id === dragRef.current ? { ...c, x: ev.clientX - offRef.x, y: ev.clientY - offRef.y } : c));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [cards]);

  return (
    <>
      <style>{bgStyles}</style>
      <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <div className="bg-layer" />

        {/* Using <Glass> wrapper component */}
        {cards.map(card => (
          <div
            key={card.id}
            onPointerDown={(e) => startDrag(card.id, e)}
            style={{ position: 'absolute', left: card.x, top: card.y, cursor: 'grab', userSelect: 'none' }}
          >
            <Glass config={{ cornerRadius: 32, blurAmount: 4 }} style={{ width: card.w, height: card.h }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>{card.title}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8 }}>{card.body}</p>
            </Glass>
          </div>
        ))}

        {/* Custom hook usage */}
        <div style={{ position: 'absolute', left: 760, top: 440, cursor: 'grab', userSelect: 'none' }}>
          <CustomGlassCard />
        </div>

        <div className="hint">Drag panels · CSS blur + WebGPU refractive edge</div>
      </div>
    </>
  );
}