import { useState, useCallback, useRef, useEffect } from 'react';
import { Glass } from '../src';

const bgStyles = `
  body { margin: 0; padding: 0; overflow: hidden; background: #0b0c10; font-family: system-ui, sans-serif; color: #fff; }
  .bg-layer { position: absolute; width: 200%; height: 200%; top: -50%; left: -50%;
    background:
      radial-gradient(circle at 35% 35%, rgba(255,0,128,0.9) 0%, transparent 35%),
      radial-gradient(circle at 65% 65%, rgba(0,242,254,0.9) 0%, transparent 35%),
      linear-gradient(rgba(255,255,255,0.12) 2px, transparent 2px),
      linear-gradient(90deg, rgba(255,255,255,0.12) 2px, transparent 2px);
    background-size: 100% 100%, 100% 100%, 50px 50px, 50px 50px;
    animation: spin 20s linear infinite; }
  @keyframes spin { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.1); } 100% { transform: rotate(360deg) scale(1); } }
  .hint { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.25); font-size: 12px; pointer-events: none; z-index: 100; }
  .drag-card { position: absolute; cursor: grab; user-select: none; touch-action: none; }
  .drag-card:active { cursor: grabbing; }
`;

interface Card { id: number; x: number; y: number; title: string; body: string; }

export default function App() {
  const [cards, setCards] = useState<Card[]>([
    { id: 1, x: 80, y: 80, title: 'Glass Component', body: 'Drop-in <Glass> wrapper. Just wrap your content.' },
    { id: 2, x: 520, y: 180, title: 'useGlass() Hook', body: 'Low-level hook for full layout control.' },
    { id: 3, x: 280, y: 400, title: 'Configurable', body: 'Tweak cornerRadius, borderWidth, refraction.' },
  ]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const dragRef = useRef<{ id: number | null; startX: number; startY: number; origX: number; origY: number }>({ id: null, startX: 0, startY: 0, origX: 0, origY: 0 });

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const { id, startX, startY, origX, origY } = dragRef.current;
      if (id === null) return;
      setCards(prev => prev.map(c => c.id === id ? { ...c, x: origX + ev.clientX - startX, y: origY + ev.clientY - startY } : c));
    };
    const onUp = () => { dragRef.current.id = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

  const onPointerDown = useCallback((id: number, e: React.PointerEvent) => {
    e.stopPropagation();
    const card = cardsRef.current.find(c => c.id === id);
    if (!card) return;
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: card.x, origY: card.y };
  }, []);

  return (
    <>
      <style>{bgStyles}</style>
      <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <div className="bg-layer" />
        {cards.map(card => (
          <div key={card.id} className="drag-card" onPointerDown={(e) => onPointerDown(card.id, e)} style={{ left: card.x, top: card.y }}>
            <Glass config={{ cornerRadius: 32, padding: 20 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>{card.title}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8 }}>{card.body}</p>
            </Glass>
          </div>
        ))}
        <div className="hint">Drag panels · CSS blur + WebGPU/GL refraction</div>
      </div>
    </>
  );
}