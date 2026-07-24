# react-liquid-glass-hook

React hook and component for **WebGPU-powered glass refraction** — SDF refractive edge + CSS `backdrop-filter` blur.

[![npm version](https://img.shields.io/npm/v/react-liquid-glass-hook.svg)](https://www.npmjs.com/package/react-liquid-glass-hook)
[![license](https://img.shields.io/npm/l/react-liquid-glass-hook.svg)](MIT)

<p align="center">
  <img src="https://img.shields.io/badge/WebGPU-required-blue" alt="WebGPU">
  <img src="https://img.shields.io/badge/React-18%2B-61dafb" alt="React 18+">
</p>

## Features

- **SDF-based refractive edge** — Real 2D refraction using signed distance functions, not bitmap masks
- **Fresnel highlights** — Physically-inspired edge glow
- **Chromatic aberration** — Subtle RGB split at the border
- **CSS blur for the body** — Lightweight `backdrop-filter` for the inner area
- **Zero dependencies** — Only React as peer dependency
- **Branchless shader** — All GPU computations use `mix`/`step`/`smoothstep`, no `if`/`for`
- **TypeScript** — Full type definitions included

## Installation

```bash
npm install react-liquid-glass-hook
```

> **Requires Chrome 113+ or Edge 113+** with WebGPU enabled.

## Quick Start

### `<Glass>` component

```tsx
import { Glass } from 'react-liquid-glass-hook';

function App() {
  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }}>
      <Glass>
        <h2>Hello Liquid Glass</h2>
        <p>This content is inside a glass panel.</p>
      </Glass>
    </div>
  );
}
```

### `useGlass()` hook

```tsx
import { useGlass } from 'react-liquid-glass-hook';

function MyCard() {
  const canvasRef = useGlass({ borderWidth: 6, refraction: 18 });

  return (
    <div style={{ width: 400, height: 300, borderRadius: 32, position: 'relative' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'relative', zIndex: 2, padding: 24 }}>
        <h2>Custom Card</h2>
      </div>
    </div>
  );
}
```

## API

### `GlassConfig`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cornerRadius` | `number` | `32` | Border radius, px |
| `borderWidth` | `number` | `4` | Width of the refractive border zone, px |
| `refraction` | `number` | `14` | Maximum refraction offset, px |
| `fresnelPower` | `number` | `5` | Fresnel curve exponent (higher = sharper edge) |
| `highlight` | `number` | `0.15` | Highlight intensity, 0–1 |
| `chromaticAberration` | `number` | `0.035` | RGB split strength, 0–0.08 |
| `glassAlpha` | `number` | `0.08` | Inner white overlay opacity |
| `innerBrighten` | `number` | `1.08` | Inner area brightness multiplier |
| `blurAmount` | `number` | `4` | CSS blur amount for the body, px |
| `shadow` | `string` | glass shadow | CSS box-shadow |
| `background` | `string` | `rgba(…)` | Background color behind the blur |
| `border` | `string` | `1px solid …` | CSS border |

### `useGlass(config?)`

Low-level hook. Returns a `RefObject<HTMLCanvasElement>`.

- Attach the returned ref to a `<canvas>` element positioned absolutely inside a container.
- The container must have `position: relative` and explicit dimensions.
- Apply your own CSS `backdrop-filter: blur(...)` to the container.

### `<Glass config? style? className? children>`

Convenience wrapper component. Renders a `<div>` with:

- CSS `backdrop-filter: blur(config.blurAmount)`
- A WebGPU `<canvas>` overlay for the refractive edge
- Inner `<div>` for children with `borderRadius = cornerRadius - borderWidth` for uniform border

## How it works

```
┌─────────────────────────────────────────┐
│  CSS background (gradients, images)     │
│                                         │
│   ┌──────────────────────────────┐      │
│   │  Glass Panel                 │      │
│   │                              │      │
│   │  ┌── CSS blur zone ──-──┐    │      │
│   │  │  backdrop-filter     │    │      │
│   │  │  blur(4px)           │    │      │
│   │  │                      │    │      │
│   │  │   Content here       │    │      │
│   │  │                      │    │      │
│   │  └──────────────────────┘    │      │
│   │                              │      │
│   │  ┌── WebGPU edge ────-──┐    │      │
│   │  │  SDF refraction      │    │      │
│   │  │  Fresnel highlight   │    │      │
│   │  │  Chromatic aberration│    │      │
│   │  └──────────────────────┘    │      │
│   └──────────────────────────────┘      │
└─────────────────────────────────────────┘
```

1. **Background** — A procedural texture is rendered to an invisible WebGPU texture (used for edge sampling).
2. **CSS Body** — The card body uses `backdrop-filter: blur()` for a lightweight frosted glass look.
3. **WebGPU Edge** — An alpha-blended canvas overlay renders the refractive border using SDF normals, Fresnel, and chromatic aberration.

## Dev

```bash
git clone https://github.com/RuslanGabbasov/react-liquid-glass
cd react-glass
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome.

## License

MIT
