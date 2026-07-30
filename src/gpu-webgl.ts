// WebGL 2.0 fallback for mobile devices where WebGPU is unavailable.
// Architecture:
//   - Hidden canvas + single WebGL context → renders animated background
//   - Each edge canvas gets its own WebGL context
//   - In render loop: render background → for each edge canvas, copy bg pixels to texture → render edge effect

import { GlassConfig } from './config';

// Hidden canvas for background
let bgCanvas: HTMLCanvasElement | null = null;
let bgCtx: WebGL2RenderingContext | null = null;
let bgProgram: WebGLProgram | null = null;
let bgQuadBuffer: WebGLBuffer | null = null;

// Edge shader source (compiled per-canvas, cached)
const EDGE_VERT = `#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const EDGE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_panelPos;
uniform vec2 u_panelSize;
uniform float u_cornerRadius;
uniform float u_borderWidth;
uniform float u_refraction;
uniform float u_fresnelPower;
uniform float u_highlight;
uniform float u_chromaticAberration;
uniform float u_glassAlpha;
uniform float u_innerBrighten;
uniform float u_lightAngle;
uniform float u_specularIntensity;
uniform float u_specularPower;
uniform vec2 u_texSize;

uniform sampler2D u_sceneTex;

vec2 sdRoundedRect(vec2 p, vec2 half, float r) {
  vec2 q = abs(p) - half + r;
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

vec2 sdfGradient(vec2 p, vec2 half, float r) {
  float e = 0.5;
  return normalize(vec2(
    sdRoundedRect(p + vec2(e, 0.0), half, r) - sdRoundedRect(p - vec2(e, 0.0), half, r),
    sdRoundedRect(p + vec2(0.0, e), half, r) - sdRoundedRect(p - vec2(0.0, e), half, r)
  ));
}

void main() {
  vec2 half = u_panelSize * 0.5;
  float r = u_cornerRadius;
  float bw = u_borderWidth;

  vec2 topLeft = u_panelPos - half;
  vec2 px = topLeft + v_uv * u_panelSize;
  vec2 local = px - u_panelPos;

  float sd = sdRoundedRect(local, half, r);
  float panelEdge = 1.0 - smoothstep(-1.0, 0.0, sd);

  float distToBorder = -sd;
  float borderFactor = (1.0 - smoothstep(0.0, bw, distToBorder)) * panelEdge;
  vec2 normal = sdfGradient(local, half, r);
  float fresnel = pow(borderFactor, u_fresnelPower);
  vec2 off = normal * fresnel * u_refraction;
  vec2 offUV = off / u_texSize;

  float caStr = u_chromaticAberration * panelEdge;
  vec2 screenUV = px / u_texSize;
  vec2 uvR = screenUV + offUV * (1.0 + caStr);
  vec2 uvG = screenUV + offUV;
  vec2 uvB = screenUV + offUV * (1.0 - caStr);

  float cr = texture(u_sceneTex, uvR).r;
  float cg = texture(u_sceneTex, uvG).g;
  float cb = texture(u_sceneTex, uvB).b;
  vec3 base = texture(u_sceneTex, screenUV).rgb;

  if (sd > 1.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 color = mix(base.rgb, vec3(cr, cg, cb), borderFactor);
  vec3 inner = mix(base.rgb * u_innerBrighten, vec3(1.0), u_glassAlpha);
  color = mix(inner, color, borderFactor);
  color = mix(color, vec3(1.0), pow(fresnel, 2.0) * u_highlight);

  vec2 lightDir = vec2(cos(u_lightAngle), sin(u_lightAngle));
  float NdotL = dot(normal, lightDir);
  float specular = pow(max(NdotL, 0.0), u_specularPower) * u_specularIntensity * borderFactor;
  color = mix(color, vec3(1.0), specular);

  color = mix(color, vec3(1.0), (1.0 - smoothstep(0.0, 1.0, abs(sd))) * panelEdge * 0.4);

  float ea = smoothstep(0.0, bw * 0.8, distToBorder) * panelEdge;
  float fo = 1.0 - smoothstep(bw, bw + 14.0, distToBorder);
  float alpha = clamp(ea * fo, 0.0, 1.0);

  fragColor = vec4(color, alpha);
}
`;

// ---- Background Fragment Shader (GLSL ES 3.00) ----
const BG_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 f2 = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f2.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f2.x), f2.y);
}

float fbm(vec2 p) {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.0) + 0.125 * noise(p * 4.0) + 0.0625 * noise(p * 8.0);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time;
  vec3 c = vec3(0.0);

  c += vec3(1.0, 0.15, 0.45) * exp(-length(uv - vec2(0.3 + sin(t * 0.3) * 0.15, 0.35 + cos(t * 0.4) * 0.1)) * 4.0) * 0.7;
  c += vec3(0.1, 0.7, 1.0) * exp(-length(uv - vec2(0.65 + cos(t * 0.25) * 0.2, 0.6 + sin(t * 0.35) * 0.15)) * 3.5) * 0.65;
  c += vec3(1.0, 0.8, 0.2) * exp(-length(uv - vec2(0.5 + sin(t * 0.2) * 0.25, 0.25 + cos(t * 0.3) * 0.2)) * 4.5) * 0.5;
  c += vec3(0.6, 0.2, 0.7) * fbm(uv * 3.0 + t * 0.1) * 0.2;

  float gs = 0.06;
  float gx = abs(fract(uv.x / gs * u_resolution.x / u_resolution.y) - 0.5) * 2.0;
  float gy = abs(fract(uv.y / gs) - 0.5) * 2.0;
  c += vec3(0.25) * smoothstep(0.96, 1.0, 1.0 - min(gx, gy)) * 0.35;

  float rd = length(uv - 0.5);
  c += vec3(0.7) * smoothstep(0.15, 0.25, abs(sin((rd - t * 0.02) * 30.0) * 0.5)) * smoothstep(0.35, 0.25, rd) * 0.2;

  c = mix(vec3(0.03, 0.04, 0.08), c, 0.9);
  c *= 1.0 - length((uv - 0.5) * 1.2) * 0.4;

  fragColor = vec4(c, 1.0);
}
`;

const BG_VERT = `#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// ---- Init ----
let loopRunning = false;
let loopStart = 0;
let sceneWidth = 0;
let sceneHeight = 0;

// Config ref — updated by mountEdgeWebGL, read by render loop
let currentConfig: GlassConfig | null = null;

// Mounted canvases
const edgeCanvases = new Map<HTMLCanvasElement, { mounted: boolean }>();

function compileShader(src: string, type: number, ctx: WebGL2RenderingContext): WebGLShader {
  const s = ctx.createShader(type)!;
  ctx.shaderSource(s, src);
  ctx.compileShader(s);
  if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
    console.error('GLSL compile error:', ctx.getShaderInfoLog(s));
    ctx.deleteShader(s);
    throw new Error('GLSL compilation failed');
  }
  return s;
}

function createProgram(vs: string, fs: string, ctx: WebGL2RenderingContext): WebGLProgram {
  const v = compileShader(vs, ctx.VERTEX_SHADER, ctx);
  const f = compileShader(fs, ctx.FRAGMENT_SHADER, ctx);
  const p = ctx.createProgram()!;
  ctx.attachShader(p, v);
  ctx.attachShader(p, f);
  ctx.linkProgram(p);
  if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) {
    console.error('GLSL link error:', ctx.getProgramInfoLog(p));
    ctx.deleteProgram(p);
    throw new Error('GLSL linking failed');
  }
  return p;
}

/** Check if WebGL2 is available */
export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * Initialize WebGL. Creates hidden canvas for background + prepares edge shader source.
 * Does NOT start render loop.
 */
export async function initWebGL(): Promise<boolean> {
  if (bgCtx) return true;

  try {
    const dpr = window.devicePixelRatio || 1;
    sceneWidth = Math.round(window.innerWidth * dpr);
    sceneHeight = Math.round(window.innerHeight * dpr);

    // Create hidden canvas for background rendering
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = sceneWidth;
    bgCanvas.height = sceneHeight;
    bgCanvas.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(bgCanvas);

    bgCtx = bgCanvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false });
    if (!bgCtx) return false;

    // Compile background program
    bgProgram = createProgram(BG_VERT, BG_FRAG, bgCtx);

    // Create shared quad buffer for background
    bgQuadBuffer = bgCtx.createBuffer()!;
    bgCtx.bindBuffer(bgCtx.ARRAY_BUFFER, bgQuadBuffer);
    bgCtx.bufferData(bgCtx.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1, 0, 2, 0, 0, 2, 0]), bgCtx.STATIC_DRAW);

    return true;
  } catch (e) {
    console.warn('WebGL init failed:', e);
    return false;
  }
}

/**
 * Start the shared render loop. Called once on first mountEdgeWebGL.
 */
function startRenderLoop(): void {
  if (loopRunning) return;
  loopRunning = true;
  loopStart = performance.now();

  function frame(ts: number) {
    if (!bgCtx || !bgProgram || !bgQuadBuffer || !bgCanvas) return;
    const t = (ts - loopStart) / 1000;

    // 1. Render background to hidden canvas
    bgCtx.viewport(0, 0, sceneWidth, sceneHeight);
    bgCtx.clearColor(0.03, 0.04, 0.08, 1.0);
    bgCtx.clear(bgCtx.COLOR_BUFFER_BIT);

    bgCtx.useProgram(bgProgram);
    bgCtx.bindBuffer(bgCtx.ARRAY_BUFFER, bgQuadBuffer);
    bgCtx.enableVertexAttribArray(0);
    bgCtx.vertexAttribPointer(0, 2, bgCtx.FLOAT, false, 16, 0);
    bgCtx.enableVertexAttribArray(1);
    bgCtx.vertexAttribPointer(1, 2, bgCtx.FLOAT, false, 16, 8);

    const bgTimeLoc = bgCtx.getUniformLocation(bgProgram, 'u_time');
    const bgResLoc = bgCtx.getUniformLocation(bgProgram, 'u_resolution');
    if (bgTimeLoc) bgCtx.uniform1f(bgTimeLoc, t);
    if (bgResLoc) bgCtx.uniform2f(bgResLoc, sceneWidth, sceneHeight);

    bgCtx.drawArrays(bgCtx.TRIANGLES, 0, 3);

    // 2. Render edge canvases to screen
    for (const [canvas, entry] of edgeCanvases) {
      if (!entry.mounted) continue;

      const parent = canvas.parentElement;
      if (!parent) continue;

      const rect = parent.getBoundingClientRect();
      const dpr2 = window.devicePixelRatio || 1;
      const cw = Math.round(rect.width * dpr2);
      const ch = Math.round(rect.height * dpr2);

      // Resize canvas if needed
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }

      // Get context for this canvas
      const ctx = canvas.getContext('webgl2');
      if (!ctx) continue;

      ctx.viewport(0, 0, cw, ch);
      ctx.clearColor(0, 0, 0, 0);
      ctx.clear(ctx.COLOR_BUFFER_BIT);

      // Upload background canvas pixels to texture (cached)
      let tex = (canvas as any)._bgTexture as WebGLTexture | undefined;
      if (!tex) {
        tex = ctx.createTexture();
        ctx.bindTexture(ctx.TEXTURE_2D, tex);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
        // Allocate texture memory
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, sceneWidth, sceneHeight, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, null);
        (canvas as any)._bgTexture = tex;
      }
      // Copy bgCanvas pixels into texture
      ctx.bindTexture(ctx.TEXTURE_2D, tex);
      ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, bgCanvas!);

      // Compile edge shader for this context (once, cached)
      let edgeProg = (canvas as any)._edgeProgram as WebGLProgram | undefined;
      if (!edgeProg) {
        edgeProg = createProgram(EDGE_VERT, EDGE_FRAG, ctx);
        (canvas as any)._edgeProgram = edgeProg;
      }
      if (!edgeProg) continue;

      ctx.useProgram(edgeProg);

      // Bind quad (cached)
      let quadBuf = (canvas as any)._quadBuffer as WebGLBuffer | undefined;
      if (!quadBuf) {
        quadBuf = ctx.createBuffer();
        ctx.bindBuffer(ctx.ARRAY_BUFFER, quadBuf);
        ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1, 0, 2, 0, 0, 2, 0]), ctx.STATIC_DRAW);
        (canvas as any)._quadBuffer = quadBuf;
      }
      ctx.bindBuffer(ctx.ARRAY_BUFFER, quadBuf);
      ctx.enableVertexAttribArray(0);
      ctx.vertexAttribPointer(0, 2, ctx.FLOAT, false, 16, 0);
      ctx.enableVertexAttribArray(1);
      ctx.vertexAttribPointer(1, 2, ctx.FLOAT, false, 16, 8);

      // Get config from ref
      const cfg = currentConfig;
      if (cfg) {
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_cornerRadius')!, cfg.cornerRadius * 2);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_borderWidth')!, cfg.borderWidth);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_refraction')!, cfg.refraction);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_fresnelPower')!, cfg.fresnelPower);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_highlight')!, cfg.highlight);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_chromaticAberration')!, cfg.chromaticAberration);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_glassAlpha')!, cfg.glassAlpha);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_innerBrighten')!, cfg.innerBrighten);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_lightAngle')!, cfg.lightAngle);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_specularIntensity')!, cfg.specularIntensity);
        ctx.uniform1f(ctx.getUniformLocation(edgeProg, 'u_specularPower')!, cfg.specularPower);
      }

      ctx.uniform2f(ctx.getUniformLocation(edgeProg, 'u_texSize')!, sceneWidth, sceneHeight);

      // Panel position + size
      const px = (rect.left + rect.width / 2) * dpr2;
      const py = (rect.top + rect.height / 2) * dpr2;
      ctx.uniform2f(ctx.getUniformLocation(edgeProg, 'u_panelPos')!, px, py);
      ctx.uniform2f(ctx.getUniformLocation(edgeProg, 'u_panelSize')!, rect.width * dpr2, rect.height * dpr2);

      // Bind scene texture
      ctx.activeTexture(ctx.TEXTURE0);
      ctx.bindTexture(ctx.TEXTURE_2D, tex);
      ctx.uniform1i(ctx.getUniformLocation(edgeProg, 'u_sceneTex')!, 0);

      // Draw
      ctx.enable(ctx.BLEND);
      ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
      ctx.disable(ctx.BLEND);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Mount an edge canvas for WebGL rendering.
 * Starts the render loop on first mount.
 */
export function mountEdgeWebGL(canvas: HTMLCanvasElement, _cardW: number, _cardH: number, config: GlassConfig): void {
  if (!bgCtx || !bgProgram) return;

  currentConfig = config;
  edgeCanvases.set(canvas, { mounted: true });

  // Start render loop on first mount
  startRenderLoop();
}

/**
 * Unmount an edge canvas.
 */
export function unmountEdgeWebGL(canvas: HTMLCanvasElement): void {
  edgeCanvases.delete(canvas);
  // Clean up per-canvas resources
  const ctx = canvas.getContext('webgl2');
  if (ctx) {
    const tex = (canvas as any)._bgTexture as WebGLTexture | undefined;
    if (tex) ctx.deleteTexture(tex);
    const buf = (canvas as any)._quadBuffer as WebGLBuffer | undefined;
    if (buf) ctx.deleteBuffer(buf);
    delete (canvas as any)._edgeProgram;
    delete (canvas as any)._bgTexture;
    delete (canvas as any)._quadBuffer;
  }
}
