/* 写真判定の裏方（画面を止めないように別スレッドで動かす）
   AI：OpenAI CLIP ViT-B/32（MITライセンス）を Transformers.js（Apache-2.0）で動かす。
   - AIのデータは初回だけ Hugging Face からダウンロードし、このスマホのブラウザ内に保存
   - 写真はこのスレッドの中で数字（特徴）にするだけ。どこにも送らない */
import { env, AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from '../vendor/transformers/transformers.min.js';

const MODEL = 'Xenova/clip-vit-base-patch32';
const CACHE = 'transformers-cache';
const base = new URL('../vendor/transformers/', import.meta.url).href;
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = { mjs: base + 'ort-wasm-simd-threaded.mjs', wasm: base + 'ort-wasm-simd-threaded.wasm' };
env.backends.onnx.wasm.numThreads = 1;

let processor = null, vision = null, textEmb = null, dim = 0, nLabels = 0;
const progress = p => {
  if (p && (p.status === 'progress' || p.status === 'done' || p.status === 'initiate'))
    postMessage({ progress: { file: String(p.file || ''), loaded: p.loaded || 0, total: p.total || 0, status: p.status } });
};
const opts = { dtype: 'q8', device: 'wasm', progress_callback: progress };

const cmds = {
  config({ host }) { if (host) env.remoteHost = host; return true; },

  /* 料理の説明文（英語）を数字（特徴）にする。終わったら文字用のAIは消して容量を空ける */
  async text({ texts }) {
    const tok = await AutoTokenizer.from_pretrained(MODEL, { progress_callback: progress });
    const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, opts);
    const parts = [];
    let d = 0;
    for (let i = 0; i < texts.length; i += 8) {
      const inputs = tok(texts.slice(i, i + 8), { padding: true, truncation: true });
      const { text_embeds } = await model(inputs);
      const t = text_embeds.normalize(2, -1);
      d = t.dims[1];
      parts.push(Float32Array.from(t.data));
      postMessage({ step: { done: Math.min(i + 8, texts.length), total: texts.length } });
    }
    await model.dispose?.();
    const out = new Float32Array(texts.length * d);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    try {
      const c = await caches.open(CACHE);
      for (const req of await c.keys()) if (/text_model/.test(req.url)) await c.delete(req);
    } catch { /* 消せなくても動作には関係ない */ }
    return { data: out, dim: d, transfer: [out.buffer] };
  },

  setText({ data, dim: d, n }) { textEmb = data; dim = d; nLabels = n; return true; },

  async loadVision() {
    if (!processor) processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback: progress });
    if (!vision) vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, opts);
    return true;
  },

  async classify({ blob, top = 5 }) {
    if (!textEmb) throw new Error('準備ができていない');
    await cmds.loadVision();
    const image = await RawImage.fromBlob(blob);
    const inputs = await processor(image);
    const { image_embeds } = await vision(inputs);
    const v = image_embeds.normalize(2, -1).data;
    if (v.length !== dim) throw new Error('AIのデータの形が合わない');
    const logits = new Float32Array(nLabels);
    let mx = -Infinity;
    for (let i = 0; i < nLabels; i++) {
      let dot = 0;
      for (let j = 0; j < dim; j++) dot += v[j] * textEmb[i * dim + j];
      logits[i] = 100 * dot;
      if (logits[i] > mx) mx = logits[i];
    }
    let sum = 0;
    for (let i = 0; i < nLabels; i++) { logits[i] = Math.exp(logits[i] - mx); sum += logits[i]; }
    const ranked = [...logits].map((x, i) => [i, x / sum]).sort((a, b) => b[1] - a[1]).slice(0, top);
    return { top: ranked };
  },

  async purge() {
    try { await vision?.dispose?.(); } catch { }
    vision = null; processor = null; textEmb = null;
    try { await caches.delete(CACHE); } catch { }
    return true;
  }
};

self.onmessage = async ({ data }) => {
  const { id, cmd, args } = data;
  try {
    const r = await cmds[cmd](args || {});
    const transfer = r && r.transfer;
    if (transfer) delete r.transfer;
    postMessage({ id, ok: true, result: r }, transfer || []);
  } catch (e) {
    postMessage({ id, ok: false, error: String((e && e.message) || e) });
  }
};
postMessage({ ready: true });
