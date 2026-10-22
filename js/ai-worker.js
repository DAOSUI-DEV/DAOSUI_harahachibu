/* 写真判定の裏方（画面を止めないように別スレッドで動かす）
   AI：Google SigLIP base patch16-224（Apache-2.0）を Transformers.js（Apache-2.0）で動かす。
   - AIのデータは初回だけ Hugging Face からダウンロードし、このスマホのブラウザ内に保存
   - 写真はこのスレッドの中で数字（特徴）にするだけ。どこにも送らない */
import { env, AutoTokenizer, SiglipTextModel, AutoProcessor, SiglipVisionModel, RawImage } from '../vendor/transformers/transformers.min.js';

const MODEL = 'Xenova/siglip-base-patch16-224';
const CACHE = 'transformers-cache';
const base = new URL('../vendor/transformers/', import.meta.url).href;
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = { mjs: base + 'ort-wasm-simd-threaded.mjs', wasm: base + 'ort-wasm-simd-threaded.wasm' };
env.backends.onnx.wasm.numThreads = 1;

let processor = null, vision = null, labelEmb = null, dim = 0, nLabels = 0;
const progress = p => {
  if (p && (p.status === 'progress' || p.status === 'done' || p.status === 'initiate'))
    postMessage({ progress: { file: String(p.file || ''), loaded: p.loaded || 0, total: p.total || 0, status: p.status } });
};
const opts = { dtype: 'q8', device: 'wasm', progress_callback: progress };
const embOf = out => (out.pooler_output || out.text_embeds || out.image_embeds).normalize(2, -1);

const cmds = {
  config({ host }) { if (host) env.remoteHost = host; return true; },

  /* 料理の説明文（英語）を数字（特徴）にする。終わったら文字用のAIは消して容量を空ける */
  async text({ texts }) {
    const tok = await AutoTokenizer.from_pretrained(MODEL, { progress_callback: progress });
    const model = await SiglipTextModel.from_pretrained(MODEL, opts);
    const parts = [];
    let d = 0;
    for (let i = 0; i < texts.length; i += 8) {
      const inputs = tok(texts.slice(i, i + 8), { padding: 'max_length', truncation: true });   // SigLIP は max_length でそろえる決まり
      const t = embOf(await model(inputs));
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

  setText({ data, dim: d, n }) { labelEmb = data; dim = d; nLabels = n; return true; },

  async loadVision() {
    if (!processor) processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback: progress });
    if (!vision) vision = await SiglipVisionModel.from_pretrained(MODEL, opts);
    return true;
  },

  /* 写真 → 写真の特徴と、全部の候補との近さ（コサイン類似度） */
  async classify({ blob }) {
    if (!labelEmb) throw new Error('準備ができていない');
    await cmds.loadVision();
    const image = await RawImage.fromBlob(blob);
    const inputs = await processor(image);
    const v = Float32Array.from(embOf(await vision(inputs)).data);
    if (v.length !== dim) throw new Error('AIのデータの形が合わない');
    const sims = new Float32Array(nLabels);
    for (let i = 0; i < nLabels; i++) {
      let dot = 0;
      for (let j = 0; j < dim; j++) dot += v[j] * labelEmb[i * dim + j];
      sims[i] = dot;
    }
    return { sims, emb: v, transfer: [sims.buffer, v.buffer] };
  },

  async purge() {
    try { await vision?.dispose?.(); } catch { }
    vision = null; processor = null; labelEmb = null;
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
postMessage({ ready: true, model: MODEL });
