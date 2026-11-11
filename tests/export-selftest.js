// 导出链路自检：在浏览器里直接验证 engine/exporter.js 与 engine/recorder.js 的关键行为。
// 不访问网络、不引入依赖；缺少 WebCodecs / AudioEncoder / OfflineAudioContext 时相关用例标记为“跳过”。
// 页面加载后可通过 window.runExportSelfTest() 在控制台调用，返回结构化结果：
//   { ok, passed, failed, skipped, results: [{ id, name, status, detail, ms }] }
//   status: 'pass' | 'fail' | 'skip'

import { renderClip, muxMp4 } from '../engine/exporter.js';
import { toStandardMp4 } from '../engine/recorder.js';

// ---------------------------------------------------------------- 小工具：字节与 MP4 解析（测试专用，与实现独立）

const te = new TextEncoder();
const u8 = (...b) => new Uint8Array(b);
const u16 = (v) => u8((v >> 8) & 255, v & 255);
const u32 = (v) => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const u64 = (v) => cat(u32(Math.floor(v / 2 ** 32)), u32(v >>> 0));
function cat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const box = (type, ...body) => { const b = cat(...body); return cat(u32(8 + b.length), te.encode(type), b); };
const full = (type, version, flags, ...body) =>
  box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...body);
const MATRIX = cat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));

function readBoxes(buf, start = 0, end = buf.length) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  let i = start;
  while (i + 8 <= end) {
    let size = dv.getUint32(i);
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    let hdr = 8;
    if (size === 1) { size = Number(dv.getBigUint64(i + 8)); hdr = 16; }
    else if (size === 0) size = end - i;
    if (size < hdr || i + size > end) break;
    out.push({ type, start: i, body: i + hdr, end: i + size });
    i += size;
  }
  return out;
}
const findBox = (buf, s, e, type) => readBoxes(buf, s, e).find((b) => b.type === type);

/** 每条视频轨的 handler 与 stsz 样本数。 */
function trackInfos(buf, moov) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const infos = [];
  for (const trak of readBoxes(buf, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = findBox(buf, trak.body, trak.end, 'mdia');
    const hdlr = mdia && findBox(buf, mdia.body, mdia.end, 'hdlr');
    const minf = mdia && findBox(buf, mdia.body, mdia.end, 'minf');
    const stbl = minf && findBox(buf, minf.body, minf.end, 'stbl');
    const stsz = stbl && findBox(buf, stbl.body, stbl.end, 'stsz');
    infos.push({
      handler: hdlr ? String.fromCharCode(...buf.slice(hdlr.body + 8, hdlr.body + 12)) : '?',
      samples: stsz ? dv.getUint32(stsz.body + 8) : null,
    });
  }
  return infos;
}

/** mvhd 的 timescale 与 duration。 */
function mvhdTiming(buf, moov) {
  const mvhd = findBox(buf, moov.body, moov.end, 'mvhd');
  if (!mvhd) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return buf[mvhd.body] === 1
    ? { timescale: dv.getUint32(mvhd.body + 20), duration: Number(dv.getBigUint64(mvhd.body + 24)) }
    : { timescale: dv.getUint32(mvhd.body + 12), duration: dv.getUint32(mvhd.body + 16) };
}

// ---------------------------------------------------------------- 用例 1：renderClip 端到端

/** 最小合成音频源：接口与 Ambience 的离线渲染部分一致（beginOffline/endOffline/_clock）。 */
function makeToneAudio() {
  if (typeof OfflineAudioContext === 'undefined') return null;
  let seconds = 0;
  return {
    _clock: 0,
    beginOffline(s) { seconds = s; },
    async endOffline() {
      const sr = 48000;
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
      const osc = ctx.createOscillator();
      osc.frequency.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start(0);
      return ctx.startRendering();
    },
  };
}

async function caseRenderClip() {
  if (typeof VideoEncoder === 'undefined') {
    return { status: 'skip', detail: '此浏览器没有 WebCodecs VideoEncoder（请用 Chrome/Edge）' };
  }
  const W = 160, H = 90, FPS = 30, SECONDS = 0.5;
  const FRAMES = Math.round(SECONDS * FPS); // 15
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  let frame = 0;
  const audio = makeToneAudio();
  let blob;
  try {
    blob = await renderClip({
      canvas, seconds: SECONDS, fps: FPS, bitrate: 1e6, audio,
      step: () => { frame++; },
      render: () => {
        ctx.fillStyle = `hsl(${(frame * 12) % 360}, 60%, 50%)`;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.fillRect((frame * 7) % (W - 20), 10, 20, 20);
      },
    });
  } catch (e) {
    if (/cannot encode|WebCodecs/.test(String(e && e.message))) {
      return { status: 'skip', detail: `此浏览器无法编码 H.264：${e.message}` };
    }
    throw e;
  }

  const bad = [];
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (String.fromCharCode(...buf.slice(4, 8)) !== 'ftyp') bad.push('文件不是以 ftyp 盒开头');
  const top = readBoxes(buf);
  const moov = top.find((b) => b.type === 'moov');
  const mdat = top.find((b) => b.type === 'mdat');
  if (!moov) bad.push('缺少 moov 盒');
  if (!mdat) bad.push('缺少 mdat 盒');
  if (moov && mdat && moov.start > mdat.start) bad.push(`moov 位于 mdat 之后（moov@${moov.start}, mdat@${mdat.start}）`);
  let durMs = null, videoSamples = null, hasSound = false;
  if (moov) {
    const t = mvhdTiming(buf, moov);
    if (!t || !t.timescale) bad.push('无法读取 mvhd 时长');
    else {
      durMs = (t.duration / t.timescale) * 1000;
      if (Math.abs(durMs - SECONDS * 1000) > 80) bad.push(`mvhd 时长 ${durMs.toFixed(0)}ms，与请求的 ${SECONDS * 1000}ms 超出容差`);
    }
    const infos = trackInfos(buf, moov);
    const video = infos.find((i) => i.handler === 'vide');
    hasSound = infos.some((i) => i.handler === 'soun');
    if (!video) bad.push('缺少视频轨');
    else {
      videoSamples = video.samples;
      if (video.samples !== FRAMES) bad.push(`视频轨样本数 ${video.samples}，期望 ${FRAMES}`);
    }
  }
  if (bad.length) return { status: 'fail', detail: bad.join('；') };
  const audioNote = audio
    ? (hasSound ? '，含 AAC 音频轨' : '，AudioEncoder 不可用，音频轨按设计省略')
    : '，无 OfflineAudioContext，按无音频渲染';
  return { status: 'pass', detail: `${FRAMES} 帧，mvhd 时长 ${Math.round(durMs)}ms，moov 在 mdat 之前${audioNote}` };
}

// ---------------------------------------------------------------- 用例 2：toStandardMp4 重写分片 MP4

/** 手工拼一个最小分片 MP4：ftyp + moov（含 mvex/trex）+ moof + mdat，两个视频样本。 */
function buildFragmentedMp4() {
  const sampleA = u8(0, 0, 0, 1, 0x67, 0x64, 0, 0x28, 0xde, 0xad, 0xbe, 0xef);
  const sampleB = u8(0, 0, 0, 1, 0x41, 0x11, 0x22, 0x33, 0x44);
  const payload = cat(sampleA, sampleB);

  const ftyp = box('ftyp', te.encode('isom'), u32(512), te.encode('isomiso2avc1mp41'));
  const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(0), u32(0), u32(0),
    u16(0), u16(0), u16(0), u16(0), MATRIX, u32(160 << 16), u32(90 << 16));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(90000), u32(0), u16(0x55c4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), te.encode('vide'), u32(0), u32(0), u32(0), te.encode('VideoHandler\0'));
  const vmhd = full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0));
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  const stsd = full('stsd', 0, 0, u32(1), box('avc1', new Uint8Array(78)));
  const trak = box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', vmhd, dinf, box('stbl', stsd))));
  const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0), u32(0x10000), u16(0x100),
    new Uint8Array(10), MATRIX, new Uint8Array(24), u32(2));
  const trex = full('trex', 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0));
  const moov = box('moov', mvhd, box('mvex', trex), trak);

  const mfhd = full('mfhd', 0, 0, u32(1));
  const tfhd = full('tfhd', 0, 0x020000, u32(1)); // default-base-is-moof
  const tfdt = full('tfdt', 1, 0, u64(0));
  // trun：data-offset + 每样本 duration/size/flags；样本 1 为关键帧，样本 2 为非关键帧
  const trun = (off) => full('trun', 0, 0x701, u32(2), u32(off),
    u32(3000), u32(sampleA.length), u32(0x02000000),
    u32(3000), u32(sampleB.length), u32(0x01010000));
  const moofLen = box('moof', mfhd, box('traf', tfhd, tfdt, trun(0))).length;
  const moof = box('moof', mfhd, box('traf', tfhd, tfdt, trun(moofLen + 8))); // mdat 紧跟 moof，头 8 字节
  const mdat = box('mdat', payload);
  return { input: cat(ftyp, moov, moof, mdat), payload, sampleCount: 2 };
}

async function caseFragmentedRewrite() {
  const { input, payload, sampleCount } = buildFragmentedMp4();
  const out = await toStandardMp4(new Blob([input], { type: 'video/mp4' }));
  const buf = new Uint8Array(await out.arrayBuffer());
  const bad = [];
  const top = readBoxes(buf);
  if (top.some((b) => b.type === 'moof')) bad.push('输出仍包含 moof 盒');
  const moov = top.find((b) => b.type === 'moov');
  const mdat = top.find((b) => b.type === 'mdat');
  if (!moov) bad.push('输出缺少 moov 盒');
  if (!mdat) bad.push('输出缺少 mdat 盒');
  if (moov && mdat && moov.start > mdat.start) bad.push('输出中 moov 位于 mdat 之后');
  if (mdat) {
    const data = buf.slice(mdat.body, mdat.end);
    if (data.length !== payload.length) bad.push(`mdat 负载 ${data.length} 字节，期望 ${payload.length} 字节`);
    else {
      let diff = -1;
      for (let i = 0; i < payload.length; i++) if (data[i] !== payload[i]) { diff = i; break; }
      if (diff >= 0) bad.push(`样本字节在第 ${diff} 字节处与输入不一致（疑似被重编码）`);
    }
  }
  if (moov) {
    const video = trackInfos(buf, moov).find((i) => i.handler === 'vide');
    if (!video) bad.push('输出缺少视频轨');
    else if (video.samples !== sampleCount) bad.push(`输出视频轨样本数 ${video.samples}，期望 ${sampleCount}`);
  }
  if (bad.length) return { status: 'fail', detail: bad.join('；') };
  return { status: 'pass', detail: `moof 已移除，${sampleCount} 个样本共 ${payload.length} 字节与输入逐字节一致` };
}

// ---------------------------------------------------------------- 用例 3：muxMp4 无音频

async function caseMuxVideoOnly() {
  const video = {
    width: 64, height: 64, timescale: 90000,
    avcC: u8(1, 0x64, 0, 0x28, 0xff),
    samples: [0, 1, 2].map((i) => ({ data: u8(0, 0, 0, 1, 0x41, 0x10 + i, 0x20 + i), dur: 3000, key: i === 0, cto: 0 })),
  };
  let blob;
  try {
    blob = muxMp4(video, null);
  } catch (e) {
    return { status: 'fail', detail: `muxMp4(无音频) 抛错：${e.message}` };
  }
  const bad = [];
  const buf = new Uint8Array(await blob.arrayBuffer());
  const top = readBoxes(buf);
  const moov = top.find((b) => b.type === 'moov');
  const mdat = top.find((b) => b.type === 'mdat');
  if (!moov || !mdat) bad.push('输出缺少 moov 或 mdat 盒');
  if (moov && mdat && moov.start > mdat.start) bad.push('moov 位于 mdat 之后');
  if (moov) {
    const infos = trackInfos(buf, moov);
    if (infos.length !== 1) bad.push(`轨道数 ${infos.length}，期望 1`);
    else {
      if (infos[0].handler !== 'vide') bad.push(`唯一轨道 handler 为 ${infos[0].handler}，期望 vide`);
      if (infos[0].samples !== 3) bad.push(`视频轨样本数 ${infos[0].samples}，期望 3`);
    }
    if (infos.some((i) => i.handler === 'soun')) bad.push('不应出现音频轨');
  }
  if (bad.length) return { status: 'fail', detail: bad.join('；') };
  return { status: 'pass', detail: '仅一条视频轨（3 个样本），无音频轨，未抛错' };
}

// ---------------------------------------------------------------- 运行器

const CASES = [
  { id: 'render-clip', name: 'renderClip：0.5s/30fps 端到端导出', run: caseRenderClip },
  { id: 'fragmented-rewrite', name: 'toStandardMp4：分片 MP4 重写（不重编码）', run: caseFragmentedRewrite },
  { id: 'mux-video-only', name: 'muxMp4：无音频只出视频轨', run: caseMuxVideoOnly },
];

export async function runExportSelfTest() {
  const results = [];
  for (const c of CASES) {
    const t0 = performance.now();
    let r;
    try {
      r = await c.run();
    } catch (e) {
      console.error(`[selftest] ${c.id} 抛异常`, e);
      r = { status: 'fail', detail: `未捕获异常：${(e && e.message) || e}` };
    }
    results.push({ id: c.id, name: c.name, status: r.status, detail: r.detail, ms: Math.round(performance.now() - t0) });
  }
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  return { ok: failed === 0, passed, failed, skipped, results };
}

// ---------------------------------------------------------------- 页面接线

if (typeof document !== 'undefined') {
  window.runExportSelfTest = runExportSelfTest;
  const btn = document.getElementById('run');
  const summaryEl = document.getElementById('summary');
  const listEl = document.getElementById('results');
  const LABEL = { pass: '通过', fail: '失败', skip: '跳过' };
  const render = (res) => {
    summaryEl.textContent = res
      ? `${res.passed} 通过，${res.failed} 失败，${res.skipped} 跳过 —— ${res.ok ? '导出链路正常' : '存在失败用例'}`
      : '运行中…';
    summaryEl.dataset.state = res ? (res.ok ? 'pass' : 'fail') : 'run';
    listEl.innerHTML = '';
    for (const r of res ? res.results : []) {
      const li = document.createElement('li');
      li.dataset.state = r.status;
      li.innerHTML = `<b></b> <span class="st"></span><br><small></small>`;
      li.querySelector('b').textContent = r.name;
      li.querySelector('.st').textContent = `${LABEL[r.status]}（${r.ms}ms）`;
      li.querySelector('small').textContent = r.detail;
      listEl.appendChild(li);
    }
  };
  const run = async () => {
    btn.disabled = true;
    render(null);
    const res = await runExportSelfTest();
    render(res);
    btn.disabled = false;
  };
  btn?.addEventListener('click', run);
  if (new URLSearchParams(location.search).has('auto')) run();
}
