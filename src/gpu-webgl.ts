// WebGL 2.0 fallback for mobile devices where WebGPU is unavailable.
import { GlassConfig } from './config';

// DOM debug
const dbg = document.createElement('div');
dbg.id = 'glass-dbg';
dbg.style.cssText = 'position:fixed;top:0;left:0;background:rgba(0,0,0,0.9);color:#0f0;padding:6px 10px;font-size:10px;font-family:monospace;z-index:99999;max-width:100vw;white-space:pre-wrap;line-height:1.3;pointer-events:none';
if (document.body) document.body.appendChild(dbg);
else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dbg));
function dbgLog(s: string) { dbg.textContent += s + '\n'; console.log('[GL]', s); }

dbgLog('=== BUILD-I ===');
dbgLog('webgl2: ' + !!document.createElement('canvas').getContext('webgl2'));
dbgLog('webgl: ' + !!document.createElement('canvas').getContext('webgl'));

let loopRunning = false;
let loopStart = 0;
let sceneWidth = 0;
let sceneHeight = 0;
let currentConfig: GlassConfig | null = null;

interface EdgeEntry {
  mounted: boolean;
  ctx: WebGL2RenderingContext | null;
  program: WebGLProgram | null;
  quadBuf: WebGLBuffer | null;
  uPanelPos: WebGLUniformLocation | null;
  uPanelSize: WebGLUniformLocation | null;
  uCornerRadius: WebGLUniformLocation | null;
  uBorderWidth: WebGLUniformLocation | null;
  uRefraction: WebGLUniformLocation | null;
  uFresnelPower: WebGLUniformLocation | null;
  uHighlight: WebGLUniformLocation | null;
  uChromaticAberration: WebGLUniformLocation | null;
  uGlassAlpha: WebGLUniformLocation | null;
  uInnerBrighten: WebGLUniformLocation | null;
  uLightAngle: WebGLUniformLocation | null;
  uSpecularIntensity: WebGLUniformLocation | null;
  uSpecularPower: WebGLUniformLocation | null;
  uTexSize: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
}

const edgeCanvases = new Map<HTMLCanvasElement, EdgeEntry>();

const EDGE_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const COMBINED_FRAG = `#version 300 es
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
uniform float u_time;

float sdRoundedRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + vec2(r);
  float outer = length(max(q, vec2(0.0)));
  float inner = min(max(q.x, q.y), 0.0);
  return outer + inner - r;
}
vec2 sdfGradient(vec2 p, vec2 halfSize, float r) {
  float e = 0.5;
  float g1 = sdRoundedRect(p+vec2(e,0), halfSize, r);
  float g2 = sdRoundedRect(p-vec2(e,0), halfSize, r);
  float g3 = sdRoundedRect(p+vec2(0,e), halfSize, r);
  float g4 = sdRoundedRect(p-vec2(0,e), halfSize, r);
  return normalize(vec2(g1 - g2, g3 - g4));
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p);
  vec2 f=fract(p);
  vec2 f2=f*f*(3.-2.*f);
  float a=hash(i);
  float b=hash(i+vec2(1.,0.));
  float c=hash(i+vec2(0.,1.));
  float d=hash(i+vec2(1.,1.));
  return mix(mix(a,b,f2.x),mix(c,d,f2.x),f2.y);
}
float fbm(vec2 p){return.5*noise(p)+.25*noise(p*2.)+.125*noise(p*4.)+.0625*noise(p*8.);}
vec3 background(vec2 uv,float t){
  vec3 c=vec3(0);
  c+=vec3(1,.15,.45)*exp(-length(uv-vec2(.3+sin(t*.3)*.15,.35+cos(t*.4)*.1))*4.)*.7;
  c+=vec3(.1,.7,1)*exp(-length(uv-vec2(.65+cos(t*.25)*.2,.6+sin(t*.35)*.15))*3.5)*.65;
  c+=vec3(1,.8,.2)*exp(-length(uv-vec2(.5+sin(t*.2)*.25,.25+cos(t*.3)*.2))*4.5)*.5;
  c+=vec3(.6,.2,.7)*fbm(uv*3.+t*.1)*.2;
  float gs=.06;
  float gx=abs(fract(uv.x/gs*u_texSize.x/u_texSize.y)-.5)*2.;
  float gy=abs(fract(uv.y/gs)-.5)*2.;
  c+=vec3(.25)*smoothstep(.96,1.,1.-min(gx,gy));
  float rd=length(uv-.5);
  c+=vec3(.7)*smoothstep(.15,.25,abs(sin((rd-t*.02)*30.)*.5))*smoothstep(.35,.25,rd);
  c=mix(vec3(.03,.04,.08),c,vec3(0.9));
  c*=1.-length((uv-.5)*1.2)*.4;
  return c;
}
void main(){
  vec2 halfSize=u_panelSize*.5;
  float r=u_cornerRadius;
  float bw=u_borderWidth;
  vec2 px=(u_panelPos-halfSize)+v_uv*u_panelSize;
  vec2 local=px-u_panelPos;
  float sd=sdRoundedRect(local,halfSize,r);
  float panelEdge=1.-smoothstep(-1.,0.,sd);
  float distToBorder=-sd;
  float borderFactor=(1.-smoothstep(0.,bw,distToBorder))*panelEdge;
  vec2 normal=sdfGradient(local,halfSize,r);
  float fresnel=pow(borderFactor,u_fresnelPower);
  vec2 off=normal*fresnel*u_refraction;
  vec2 offUV=off/u_texSize;
  float caStr=u_chromaticAberration*panelEdge;
  vec2 screenUV=px/u_texSize;
  vec2 uvR=screenUV+offUV*(1.+caStr);
  vec2 uvG=screenUV+offUV;
  vec2 uvB=screenUV+offUV*(1.-caStr);
  vec3 base=background(screenUV,u_time);
  vec3 refracted=vec3(background(uvR,u_time).r,background(uvG,u_time).g,background(uvB,u_time).b);
  if(sd>1.){fragColor=vec4(0);return;}
  vec3 color=mix(base,refracted,borderFactor);
  vec3 inner=mix(base*u_innerBrighten,vec3(1),u_glassAlpha);
  color=mix(inner,color,borderFactor);
  color=mix(color,vec3(1),pow(fresnel,2.)*u_highlight);
  vec2 lightDir=vec2(cos(u_lightAngle),sin(u_lightAngle));
  float NdotL=dot(normal,lightDir);
  float specular=pow(max(NdotL,0.),u_specularPower)*u_specularIntensity*borderFactor;
  color=mix(color,vec3(1),specular);
  color=mix(color,vec3(1),(1.-smoothstep(0.,1.,abs(sd)))*panelEdge*.4);
  float ea=smoothstep(0.,bw*.8,distToBorder)*panelEdge;
  float fo=1.-smoothstep(bw,bw+14.,distToBorder);
  fragColor=vec4(color,clamp(ea*fo,0.,1.));
}`;

function compileShader(src: string, type: number, ctx: WebGL2RenderingContext): WebGLShader {
  const s = ctx.createShader(type)!;
  ctx.shaderSource(s, src);
  ctx.compileShader(s);
  if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
    dbgLog('COMPILE FAIL: ' + ctx.getShaderInfoLog(s));
    ctx.deleteShader(s);
    throw new Error('compile');
  }
  return s;
}
function createProgram(vs: string, fs: string, ctx: WebGL2RenderingContext): WebGLProgram {
  const v = compileShader(vs, ctx.VERTEX_SHADER, ctx);
  const f = compileShader(fs, ctx.FRAGMENT_SHADER, ctx);
  const p = ctx.createProgram()!;
  ctx.attachShader(p, v);
  ctx.attachShader(p, f);
  ctx.bindAttribLocation(p, 0, 'a_pos');
  ctx.bindAttribLocation(p, 1, 'a_uv');
  ctx.linkProgram(p);
  if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) {
    dbgLog('LINK FAIL: ' + ctx.getProgramInfoLog(p));
    ctx.deleteProgram(p);
    throw new Error('link');
  }
  return p;
}
function buildResources(entry: EdgeEntry, ctx: WebGL2RenderingContext): void {
  entry.program = createProgram(EDGE_VERT, COMBINED_FRAG, ctx);
  const p = entry.program;
  entry.uPanelPos = ctx.getUniformLocation(p, 'u_panelPos');
  entry.uPanelSize = ctx.getUniformLocation(p, 'u_panelSize');
  entry.uCornerRadius = ctx.getUniformLocation(p, 'u_cornerRadius');
  entry.uBorderWidth = ctx.getUniformLocation(p, 'u_borderWidth');
  entry.uRefraction = ctx.getUniformLocation(p, 'u_refraction');
  entry.uFresnelPower = ctx.getUniformLocation(p, 'u_fresnelPower');
  entry.uHighlight = ctx.getUniformLocation(p, 'u_highlight');
  entry.uChromaticAberration = ctx.getUniformLocation(p, 'u_chromaticAberration');
  entry.uGlassAlpha = ctx.getUniformLocation(p, 'u_glassAlpha');
  entry.uInnerBrighten = ctx.getUniformLocation(p, 'u_innerBrighten');
  entry.uLightAngle = ctx.getUniformLocation(p, 'u_lightAngle');
  entry.uSpecularIntensity = ctx.getUniformLocation(p, 'u_specularIntensity');
  entry.uSpecularPower = ctx.getUniformLocation(p, 'u_specularPower');
  entry.uTexSize = ctx.getUniformLocation(p, 'u_texSize');
  entry.uTime = ctx.getUniformLocation(p, 'u_time');
  const buf = ctx.createBuffer()!;
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1,3,0,2, -1,-1,0,0, 3,-1,2,0]), ctx.STATIC_DRAW);
  entry.quadBuf = buf;
}

export function isWebGLAvailable(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
export async function initWebGL(): Promise<boolean> {
  if (loopRunning) return true;
  try {
    if (!document.createElement('canvas').getContext('webgl2')) return false;
    const dpr = devicePixelRatio || 1;
    sceneWidth = Math.round(innerWidth * dpr);
    sceneHeight = Math.round(innerHeight * dpr);
    return true;
  } catch { return false; }
}

function startRenderLoop(): void {
  if (loopRunning) return;
  loopRunning = true;
  loopStart = performance.now();
  let firstFrame = true;
  let frameCount = 0;

  dbgLog('Loop START, canvases=' + edgeCanvases.size);

  function frame(ts: number) {
    frameCount++;
    const t = (ts - loopStart) / 1000;
    const dpr = devicePixelRatio || 1;

    const newW = Math.round(innerWidth * dpr), newH = Math.round(innerHeight * dpr);
    if (newW !== sceneWidth || newH !== sceneHeight) { sceneWidth = newW; sceneHeight = newH; }

    for (const [canvas, entry] of edgeCanvases) {
      if (!entry.mounted) continue;
      const parent = canvas.parentElement;
      if (!parent) { if (frameCount <= 2) dbgLog('skip: no parent'); continue; }
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) { if (frameCount <= 2) dbgLog('skip: zero rect'); continue; }

      const cw = Math.round(rect.width * dpr);
      const ch = Math.round(rect.height * dpr);

      if (frameCount === 1) {
        dbgLog('Canvas[' + edgeCanvases.size + '] parent=' + rect.width.toFixed(0) + 'x' + rect.height.toFixed(0) + ' canvas=' + canvas.width + 'x' + canvas.height + ' dpr=' + dpr);
        const cs = getComputedStyle(canvas);
        dbgLog('Canvas CSS: ' + cs.width + 'x' + cs.height + ' display=' + cs.display + ' visibility=' + cs.visibility);
      }

      if (firstFrame || canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        entry.ctx = null;
        entry.program = null;
        entry.quadBuf = null;
      }

      if (!entry.ctx) {
        const ctx = canvas.getContext('webgl2', { alpha: true, antialias: false, preserveDrawingBuffer: false });
        if (!ctx) { if (frameCount <= 2) dbgLog('skip: no webgl2 ctx'); continue; }
        entry.ctx = ctx;
        entry.program = null;
        entry.quadBuf = null;
        if (frameCount <= 2) dbgLog('Context acquired, renderer=' + ctx.getParameter(ctx.RENDERER));
      }

      const ctx = entry.ctx;
      if (!entry.program) {
        try { buildResources(entry, ctx); } catch (e) { dbgLog('buildResources FAIL: ' + e); continue; }
        if (frameCount <= 2) dbgLog('Program built OK');
      }

      const prog = entry.program!;
      ctx.viewport(0, 0, cw, ch);
      ctx.clearColor(0, 0, 0, 0);
      ctx.clear(ctx.COLOR_BUFFER_BIT);
      ctx.useProgram(prog);
      ctx.bindBuffer(ctx.ARRAY_BUFFER, entry.quadBuf);
      ctx.enableVertexAttribArray(0);
      ctx.vertexAttribPointer(0, 2, ctx.FLOAT, false, 16, 0);
      ctx.enableVertexAttribArray(1);
      ctx.vertexAttribPointer(1, 2, ctx.FLOAT, false, 16, 8);

      const cfg = (window as any).__glassGyroConfig || currentConfig;
      if (cfg) {
        ctx.uniform1f(entry.uCornerRadius, cfg.cornerRadius * 2);
        ctx.uniform1f(entry.uBorderWidth, cfg.borderWidth);
        ctx.uniform1f(entry.uRefraction, cfg.refraction);
        ctx.uniform1f(entry.uFresnelPower, cfg.fresnelPower);
        ctx.uniform1f(entry.uHighlight, cfg.highlight);
        ctx.uniform1f(entry.uChromaticAberration, cfg.chromaticAberration);
        ctx.uniform1f(entry.uGlassAlpha, cfg.glassAlpha);
        ctx.uniform1f(entry.uInnerBrighten, cfg.innerBrighten);
        ctx.uniform1f(entry.uLightAngle, cfg.lightAngle);
        ctx.uniform1f(entry.uSpecularIntensity, cfg.specularIntensity);
        ctx.uniform1f(entry.uSpecularPower, cfg.specularPower);
      }
      ctx.uniform2f(entry.uTexSize, sceneWidth, sceneHeight);
      ctx.uniform1f(entry.uTime, t);

      const px = (rect.left + rect.width/2) * dpr;
      const py = (rect.top + rect.height/2) * dpr;
      ctx.uniform2f(entry.uPanelPos, px, py);
      ctx.uniform2f(entry.uPanelSize, rect.width * dpr, rect.height * dpr);

      ctx.enable(ctx.BLEND);
      ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
      ctx.disable(ctx.BLEND);

      if (frameCount <= 3) {
        const glErr = ctx.getError();
        if (glErr !== ctx.NO_ERROR) dbgLog('GL ERROR: ' + glErr);
        else dbgLog('Draw OK');
      }
    }

    firstFrame = false;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export function mountEdgeWebGL(canvas: HTMLCanvasElement, _w: number, _h: number, config: GlassConfig): void {
  currentConfig = config;
  edgeCanvases.set(canvas, {
    mounted: true, ctx: null, program: null, quadBuf: null,
    uPanelPos: null, uPanelSize: null, uCornerRadius: null, uBorderWidth: null,
    uRefraction: null, uFresnelPower: null, uHighlight: null, uChromaticAberration: null,
    uGlassAlpha: null, uInnerBrighten: null, uLightAngle: null, uSpecularIntensity: null,
    uSpecularPower: null, uTexSize: null, uTime: null,
  });
  dbgLog('mountEdgeWebGL, total=' + edgeCanvases.size);
  startRenderLoop();
  (window as any).__glassStatus = { backend: 'webgl', mounted: true };
}

export function unmountEdgeWebGL(canvas: HTMLCanvasElement): void {
  const e = edgeCanvases.get(canvas);
  if (e?.ctx && e.program) e.ctx.deleteProgram(e.program);
  if (e?.ctx && e.quadBuf) e.ctx.deleteBuffer(e.quadBuf);
  edgeCanvases.delete(canvas);
}