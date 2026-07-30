// WebGPU singleton: manages device, texture, and edge rendering.
// One render loop serves all mounted edge canvases.

import { GlassConfig } from './config';

let device: GPUDevice | null = null;
let sampler: GPUSampler | null = null;
let sceneTexture: GPUTexture | null = null;
let sceneView: GPUTextureView | null = null;

let bgPipeline: GPURenderPipeline | null = null;
let bgBindGroup: GPUBindGroup | null = null;
let bgUniformBuffer: GPUBuffer | null = null;

let edgeBGL: GPUBindGroupLayout | null = null;
let edgePL: GPUPipelineLayout | null = null;
let edgeShader: GPUShaderModule | null = null;

type EdgeEntry = {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  ctx: GPUCanvasContext;
  canvas: HTMLCanvasElement;
};

const edges = new Map<HTMLCanvasElement, EdgeEntry>();

// ---- Edge WGSL ----
const EDGE_WGSL = /* wgsl */ `
struct Uniforms {
  panelPos: vec2f,         // 0
  panelSize: vec2f,        // 8
  cornerRadius: f32,       // 16
  borderWidth: f32,        // 20
  refraction: f32,         // 24
  fresnelPower: f32,       // 28
  highlight: f32,          // 32
  chromaticAberration: f32,// 36
  glassAlpha: f32,         // 40
  innerBrighten: f32,      // 44
  lightAngle: f32,         // 48
  specularIntensity: f32,  // 52
  specularPower: f32,      // 56
}

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn sdRoundedRect(p: vec2f, half: vec2f, r: f32) -> f32 {
  let q = abs(p) - half + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn sdfGradient(p: vec2f, half: vec2f, r: f32) -> vec2f {
  let e = 0.5;
  return normalize(vec2f(
    sdRoundedRect(p + vec2f(e,0), half, r) - sdRoundedRect(p - vec2f(e,0), half, r),
    sdRoundedRect(p + vec2f(0,e), half, r) - sdRoundedRect(p - vec2f(0,e), half, r),
  ));
}

struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f }

@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let a = array(vec2f(-1,3), vec2f(-1,-1), vec2f(3,-1));
  let b = array(vec2f(0,2), vec2f(0,0), vec2f(2,0));
  o.p = vec4f(a[i], 0, 1); o.uv = b[i]; return o;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let half = u.panelSize * 0.5;
  let r = u.cornerRadius;
  let bw = u.borderWidth;

  let topLeft = u.panelPos - half;
  let px = topLeft + in.uv * u.panelSize;
  let texSize = vec2f(textureDimensions(tex));
  let screenUV = px / texSize;
  let local = px - u.panelPos;

  let base = textureSample(tex, smp, screenUV);
  let sd = sdRoundedRect(local, half, r);
  let panelEdge = 1.0 - smoothstep(-1.0, 0.0, sd);

  if sd > 1.0 { return vec4f(0.0); }

  let distToBorder = -sd;
  let borderFactor = (1.0 - smoothstep(0.0, bw, distToBorder)) * panelEdge;
  let normal = sdfGradient(local, half, r);
  let fresnel = pow(borderFactor, u.fresnelPower);
  let off = normal * fresnel * u.refraction;
  let offUV = off / texSize;

  let ca = u.chromaticAberration * panelEdge;
  let cr = textureSample(tex, smp, screenUV + offUV * (1.0 + ca)).r;
  let cg = textureSample(tex, smp, screenUV + offUV).g;
  let cb = textureSample(tex, smp, screenUV + offUV * (1.0 - ca)).b;

  var color = mix(base.rgb, vec3f(cr, cg, cb), borderFactor);
  let inner = mix(base.rgb * u.innerBrighten, vec3f(1.0), u.glassAlpha);
  color = mix(inner, color, borderFactor);
  color = mix(color, vec3f(1.0), pow(fresnel, 2.0) * u.highlight);

  // Specular highlight: rim light based on normal vs light direction
  let lightDir = vec2f(cos(u.lightAngle), sin(u.lightAngle));
  let NdotL = dot(normal, lightDir);
  let specular = pow(max(NdotL, 0.0), u.specularPower) * u.specularIntensity * borderFactor;
  color = mix(color, vec3f(1.0), specular);

  color = mix(color, vec3f(1.0), (1.0 - smoothstep(0.0, 1.0, abs(sd))) * panelEdge * 0.4);

  let ea = smoothstep(0.0, bw * 0.8, distToBorder) * panelEdge;
  let fo = 1.0 - smoothstep(bw, bw + 14.0, distToBorder);
  return vec4f(color, clamp(ea * fo, 0.0, 1.0));
}
`;

// ---- Background WGSL (invisible) ----
const BG_WGSL = /* wgsl */ `
struct U { time: f32, resolution: vec2f }
@group(0) @binding(0) var<uniform> u: U;

fn hash(p: vec2f) -> f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn noise(p: vec2f) -> f32 {
  let i=floor(p); let f=fract(p); let f2=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2f(1,0)),f2.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1,1)),f2.x),f2.y);
}
fn fbm(p: vec2f) -> f32 { return 0.5*noise(p)+0.25*noise(p*2)+0.125*noise(p*4)+0.0625*noise(p*8); }

struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i:u32)->VO {
  var o:VO; let a=array(vec2f(-1,3),vec2f(-1,-1),vec2f(3,-1)); let b=array(vec2f(0,2),vec2f(0,0),vec2f(2,0));
  o.p=vec4f(a[i],0,1); o.uv=b[i]; return o;
}
@fragment fn fs(in:VO)->@location(0)vec4f{
  let uv=in.uv; let t=u.time;
  var c=vec3f(0.0);
  c+=vec3f(1,0.15,0.45)*exp(-length(uv-vec2f(0.3+sin(t*0.3)*0.15,0.35+cos(t*0.4)*0.1))*4)*0.7;
  c+=vec3f(0.1,0.7,1)*exp(-length(uv-vec2f(0.65+cos(t*0.25)*0.2,0.6+sin(t*0.35)*0.15))*3.5)*0.65;
  c+=vec3f(1,0.8,0.2)*exp(-length(uv-vec2f(0.5+sin(t*0.2)*0.25,0.25+cos(t*0.3)*0.2))*4.5)*0.5;
  c+=vec3f(0.6,0.2,0.7)*fbm(uv*3+t*0.1)*0.2;
  let gs=0.06; let gx=abs(fract(uv.x/gs*u.resolution.x/u.resolution.y)-0.5)*2.0; let gy=abs(fract(uv.y/gs)-0.5)*2.0;
  c+=vec3f(0.25)*smoothstep(0.96,1,1-min(gx,gy))*0.35;
  let rd=length(uv-0.5); c+=vec3f(0.7)*smoothstep(0.15,0.25,abs(sin((rd-t*0.02)*30)*0.5))*smoothstep(0.35,0.25,rd)*0.2;
  c=mix(vec3f(0.03,0.04,0.08),c,0.9); c*=1-length((uv-0.5)*1.2)*0.4;
  return vec4f(c,1);
}
`;

// ---- Init ----
let loopRunning = false;

export async function initGPU(): Promise<void> {
  if (device) return;

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU not available');
  device = await adapter.requestDevice();

  sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);

  sceneTexture = device.createTexture({
    size: [w, h],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  sceneView = sceneTexture.createView();

  const bgMod = device.createShaderModule({ code: BG_WGSL });
  const bgBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
    ],
  });
  bgPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgBGL] }),
    vertex: { module: bgMod, entryPoint: 'vs' },
    fragment: { module: bgMod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
    primitive: { topology: 'triangle-list' },
  });
  bgUniformBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  bgBindGroup = device.createBindGroup({ layout: bgBGL, entries: [{ binding: 0, resource: { buffer: bgUniformBuffer } }] });

  edgeBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' as const } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' as const } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } },
    ],
  });
  edgePL = device.createPipelineLayout({ bindGroupLayouts: [edgeBGL] });
  edgeShader = device.createShaderModule({ code: EDGE_WGSL });

  if (!loopRunning) {
    loopRunning = true;
    const texW = w;
    const texH = h;
    const start = performance.now();
    function frame(ts: number) {
      if (!device) return;
      const enc = device.createCommandEncoder();

      // 1. Render background → sceneTexture
      device.queue.writeBuffer(bgUniformBuffer!, 0, new Float32Array([(ts - start) / 1000, 0, texW, texH]));
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: sceneView!, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.03, g: 0.04, b: 0.08, a: 1 } }],
        });
        pass.setPipeline(bgPipeline!);
        pass.setBindGroup(0, bgBindGroup!);
        pass.draw(3);
        pass.end();
      }

      // 2. Render edge canvases — write per-frame positions
      if (edges.size > 0) {
        const dpr2 = window.devicePixelRatio || 1;
        for (const e of edges.values()) {
          const parent = e.canvas.parentElement;
          if (!parent) continue;
          const rect = parent.getBoundingClientRect();

          // Write ONLY panelPos + panelSize (offsets 0-15), keep config intact
          const pos = new Float32Array(4);
          pos[0] = (rect.left + rect.width / 2) * dpr2;
          pos[1] = (rect.top + rect.height / 2) * dpr2;
          pos[2] = rect.width * dpr2;
          pos[3] = rect.height * dpr2;
          device.queue.writeBuffer(e.uniformBuffer, 0, pos);

          const tex = e.ctx.getCurrentTexture();
          const pass = enc.beginRenderPass({
            colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
          });
          pass.setPipeline(e.pipeline);
          pass.setBindGroup(0, e.bindGroup);
          pass.draw(3);
          pass.end();
        }
      }

      device.queue.submit([enc.finish()]);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
}

// ---- Public API ----

export function mountEdge(canvas: HTMLCanvasElement, cardW: number, cardH: number, config: GlassConfig): void {
  if (!device || !sceneView || !edgeBGL || !edgePL || !edgeShader) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cardW * dpr);
  canvas.height = Math.round(cardH * dpr);

  const ctx = canvas.getContext('webgpu');
  if (!ctx) return;
  const fmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: fmt, alphaMode: 'premultiplied' });

  const pipeline = device.createRenderPipeline({
    layout: edgePL,
    vertex: { module: edgeShader, entryPoint: 'vs' },
    fragment: {
      module: edgeShader,
      entryPoint: 'fs',
      targets: [{
        format: fmt,
        blend: {
          color: { srcFactor: 'src-alpha' as GPUBlendFactor, dstFactor: 'one-minus-src-alpha' as GPUBlendFactor },
          alpha: { srcFactor: 'one' as GPUBlendFactor, dstFactor: 'one-minus-src-alpha' as GPUBlendFactor },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const ubuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // Write static config params at offset 16 (past panelPos + panelSize)
  const cfg = new Float32Array(11);
  cfg[0] = config.cornerRadius * 2;
  cfg[1] = config.borderWidth;
  cfg[2] = config.refraction;
  cfg[3] = config.fresnelPower;
  cfg[4] = config.highlight;
  cfg[5] = config.chromaticAberration;
  cfg[6] = config.glassAlpha;
  cfg[7] = config.innerBrighten;
  cfg[8] = config.lightAngle;
  cfg[9] = config.specularIntensity;
  cfg[10] = config.specularPower;
  device.queue.writeBuffer(ubuf, 16, cfg);

  const bg = device.createBindGroup({
    layout: edgeBGL,
    entries: [
      { binding: 0, resource: sceneView },
      { binding: 1, resource: sampler! },
      { binding: 2, resource: { buffer: ubuf } },
    ],
  });

  edges.set(canvas, { pipeline, bindGroup: bg, uniformBuffer: ubuf, ctx, canvas });
}

export function unmountEdge(canvas: HTMLCanvasElement): void {
  edges.delete(canvas);
  canvas.width = 1;
  canvas.height = 1;
}
