// Two ways to record a clip for X:
//   canvas: the render itself at the exact output size, with the ambience track. Clean, no UI.
//   tab:    a capture of the stage element (panel, cursor, everything you see) with tab audio.
//           Chrome asks once which tab to share; pick this one.

const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.4d0028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

export class Recorder {
  constructor() {
    this.rec = null;
    this.timer = null;
    this.owned = [];
  }

  get active() {
    return !!this.rec;
  }

  start(stream, seconds, name, done) {
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const chunks = [];
    const rec = (this.rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 28e6, audioBitsPerSecond: 192e3 }));
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearTimeout(this.timer);
      this.owned.forEach((t) => t.stop());
      this.owned = [];
      this.rec = null;
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      done(new Blob(chunks, { type: type || 'video/webm' }), `${name}.${ext}`, ext);
    };
    rec.start(250);
    if (seconds > 0) this.timer = setTimeout(() => this.stop(), seconds * 1000);
    return type;
  }

  stop() {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
  }

  canvasStream(canvas, audioStream) {
    const s = canvas.captureStream(60);
    this.owned = [...s.getVideoTracks()];
    const a = audioStream?.getAudioTracks?.()[0];
    if (a) s.addTrack(a);
    return s;
  }

  async tabStream(element) {
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60, displaySurface: 'browser' },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      systemAudio: 'include',
    });
    const [track] = s.getVideoTracks();
    let restricted = false;
    if (window.RestrictionTarget && track.restrictTo) {
      // element capture: only the stage and what is inside it, even if something overlaps it
      try {
        await track.restrictTo(await window.RestrictionTarget.fromElement(element));
        restricted = true;
      } catch (e) {
        console.warn('Element capture unavailable, trying region capture', e);
      }
    }
    if (!restricted && window.CropTarget && track.cropTo) {
      try {
        await track.cropTo(await window.CropTarget.fromElement(element));
      } catch (e) {
        console.warn('Region capture unavailable, recording the whole tab', e);
      }
    }
    this.owned = [...s.getTracks()];
    return s;
  }
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------- fragmented MP4 -> standard MP4
// Chrome's MediaRecorder writes fragmented MP4 with a zero duration in moov. Some uploaders and players
// misread that. This rewrites it as a normal MP4 (index first, one mdat) without re-encoding.

function readBoxes(dv, start, end) {
  const out = [];
  let i = start;
  while (i + 8 <= end) {
    let size = dv.getUint32(i);
    const type = String.fromCharCode(dv.getUint8(i + 4), dv.getUint8(i + 5), dv.getUint8(i + 6), dv.getUint8(i + 7));
    let hdr = 8;
    if (size === 1) { size = Number(dv.getBigUint64(i + 8)); hdr = 16; } else if (size === 0) size = end - i;
    out.push({ type, start: i, body: i + hdr, end: i + size });
    i += size;
  }
  return out;
}
const find = (dv, s, e, type) => readBoxes(dv, s, e).find((b) => b.type === type);

export async function toStandardMp4(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const top = readBoxes(dv, 0, buf.length);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov || !top.some((b) => b.type === 'moof')) return blob; // already standard
  const trex = {};
  const mvex = find(dv, moov.body, moov.end, 'mvex');
  if (mvex) for (const b of readBoxes(dv, mvex.body, mvex.end)) if (b.type === 'trex') trex[dv.getUint32(b.body + 4)] = { dur: dv.getUint32(b.body + 12), size: dv.getUint32(b.body + 16), flags: dv.getUint32(b.body + 20) };
  const tracks = new Map();
  for (const t of readBoxes(dv, moov.body, moov.end)) {
    if (t.type !== 'trak') continue;
    const tkhd = find(dv, t.body, t.end, 'tkhd');
    const v0 = dv.getUint8(tkhd.body) === 0;
    const id = dv.getUint32(tkhd.body + (v0 ? 12 : 20));
    const mdia = find(dv, t.body, t.end, 'mdia');
    const mdhd = find(dv, mdia.body, mdia.end, 'mdhd');
    const timescale = dv.getUint32(mdhd.body + (dv.getUint8(mdhd.body) === 0 ? 12 : 20));
    const hdlr = find(dv, mdia.body, mdia.end, 'hdlr');
    const minf = find(dv, mdia.body, mdia.end, 'minf');
    const stbl = find(dv, minf.body, minf.end, 'stbl');
    const stsd = find(dv, stbl.body, stbl.end, 'stsd');
    const mh = find(dv, minf.body, minf.end, 'vmhd') || find(dv, minf.body, minf.end, 'smhd');
    const dinf = find(dv, minf.body, minf.end, 'dinf');
    const slice = (b) => buf.slice(b.start, b.end);
    tracks.set(id, { id, timescale, handler: String.fromCharCode(...buf.slice(hdlr.body + 8, hdlr.body + 12)), tkhd: slice(tkhd), hdlr: slice(hdlr), stsd: slice(stsd), mh: slice(mh), dinf: slice(dinf), samples: [], start: null, d: trex[id] || { dur: 0, size: 0, flags: 0 } });
  }
  for (const moof of top) {
    if (moof.type !== 'moof') continue;
    for (const traf of readBoxes(dv, moof.body, moof.end)) {
      if (traf.type !== 'traf') continue;
      const tfhd = find(dv, traf.body, traf.end, 'tfhd');
      const flags = dv.getUint32(tfhd.body) & 0xffffff;
      let p = tfhd.body + 4;
      const t = tracks.get(dv.getUint32(p));
      p += 4;
      let base = moof.start, ddur = t.d.dur, dsize = t.d.size, dflags = t.d.flags;
      if (flags & 1) { base = Number(dv.getBigUint64(p)); p += 8; }
      if (flags & 2) p += 4;
      if (flags & 8) { ddur = dv.getUint32(p); p += 4; }
      if (flags & 0x10) { dsize = dv.getUint32(p); p += 4; }
      if (flags & 0x20) { dflags = dv.getUint32(p); p += 4; }
      const tfdt = find(dv, traf.body, traf.end, 'tfdt');
      if (tfdt && t.start === null) t.start = dv.getUint8(tfdt.body) === 0 ? dv.getUint32(tfdt.body + 4) : Number(dv.getBigUint64(tfdt.body + 4));
      for (const run of readBoxes(dv, traf.body, traf.end)) {
        if (run.type !== 'trun') continue;
        const vf = dv.getUint32(run.body), version = vf >>> 24, rf = vf & 0xffffff;
        const count = dv.getUint32(run.body + 4);
        let q = run.body + 8, off = base, first = null;
        if (rf & 1) { off = base + dv.getInt32(q); q += 4; }
        if (rf & 4) { first = dv.getUint32(q); q += 4; }
        for (let k = 0; k < count; k++) {
          let dur = ddur, size = dsize, sf = dflags, cto = 0;
          if (rf & 0x100) { dur = dv.getUint32(q); q += 4; }
          if (rf & 0x200) { size = dv.getUint32(q); q += 4; }
          if (rf & 0x400) { sf = dv.getUint32(q); q += 4; }
          if (rf & 0x800) { cto = version ? dv.getInt32(q) : dv.getUint32(q); q += 4; }
          if (k === 0 && first !== null) sf = first;
          t.samples.push({ data: buf.subarray(off, off + size), dur, key: !(sf & 0x10000), cto });
          off += size;
        }
      }
    }
  }
  const { muxRaw } = await import('./exporter.js');
  return muxRaw([...tracks.values()]);
}
