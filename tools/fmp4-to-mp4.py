"""Rewrite a fragmented MP4 (what Chrome's MediaRecorder produces) as a standard MP4.

Chrome writes moov with duration 0 plus moof/mdat fragments. Some uploaders and players misread that
(wrong length, no seeking). This keeps every encoded sample untouched (no re-encode) and writes a normal
file: ftyp, moov (full sample tables, correct durations) first, then one mdat.

Usage: python3 fmp4-to-mp4.py in.mp4 [out.mp4]
"""
import struct
import sys
from pathlib import Path


def read_boxes(buf, start, end):
    i = start
    while i + 8 <= end:
        size, typ = struct.unpack(">I4s", buf[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack(">Q", buf[i + 8:i + 16])[0]
            hdr = 16
        elif size == 0:
            size = end - i
        yield typ.decode("latin1"), i, i + hdr, i + size
        i += size


def child(buf, start, end, name):
    for typ, s, body, e in read_boxes(buf, start, end):
        if typ == name:
            return s, body, e
    return None


def box(typ, payload):
    return struct.pack(">I4s", 8 + len(payload), typ.encode()) + payload


def fullbox(typ, version, flags, payload):
    return box(typ, struct.pack(">I", (version << 24) | flags) + payload)


def parse(path):
    buf = Path(path).read_bytes()
    tracks = {}
    order = []
    moov = child(buf, 0, len(buf), "moov")
    if not moov:
        raise SystemExit("no moov box")
    _, mbody, mend = moov
    trex = {}
    mvex = child(buf, mbody, mend, "mvex")
    if mvex:
        for typ, s, body, e in read_boxes(buf, mvex[1], mvex[2]):
            if typ == "trex":
                tid, sdi, dur, size, flags = struct.unpack(">IIIII", buf[body + 4:body + 24])
                trex[tid] = dict(duration=dur, size=size, flags=flags)
    for typ, s, body, e in read_boxes(buf, mbody, mend):
        if typ != "trak":
            continue
        tkhd = child(buf, body, e, "tkhd")
        ver = buf[tkhd[1]]
        tid = struct.unpack(">I", buf[tkhd[1] + (12 if ver == 0 else 20):tkhd[1] + (16 if ver == 0 else 24)])[0]
        mdia = child(buf, body, e, "mdia")
        mdhd = child(buf, mdia[1], mdia[2], "mdhd")
        mver = buf[mdhd[1]]
        timescale = struct.unpack(">I", buf[mdhd[1] + (12 if mver == 0 else 20):mdhd[1] + (16 if mver == 0 else 24)])[0]
        hdlr = child(buf, mdia[1], mdia[2], "hdlr")
        handler = buf[hdlr[1] + 8:hdlr[1] + 12].decode("latin1")
        minf = child(buf, mdia[1], mdia[2], "minf")
        stbl = child(buf, minf[1], minf[2], "stbl")
        stsd = child(buf, stbl[1], stbl[2], "stsd")
        media_header = child(buf, minf[1], minf[2], "vmhd") or child(buf, minf[1], minf[2], "smhd")
        dinf = child(buf, minf[1], minf[2], "dinf")
        tracks[tid] = dict(
            id=tid, timescale=timescale, handler=handler,
            tkhd=buf[tkhd[0]:tkhd[2]], hdlr=buf[hdlr[0]:hdlr[2]], stsd=buf[stsd[0]:stsd[2]],
            mh=buf[media_header[0]:media_header[2]], dinf=buf[dinf[0]:dinf[2]],
            samples=[], start=None, defaults=trex.get(tid, dict(duration=0, size=0, flags=0)),
        )
        order.append(tid)

    for typ, s, body, e in read_boxes(buf, 0, len(buf)):
        if typ != "moof":
            continue
        moof_start = s
        for ttyp, ts, tbody, te in read_boxes(buf, body, e):
            if ttyp != "traf":
                continue
            tfhd = child(buf, tbody, te, "tfhd")
            vf = struct.unpack(">I", buf[tfhd[1]:tfhd[1] + 4])[0]
            flags = vf & 0xFFFFFF
            p = tfhd[1] + 4
            tid = struct.unpack(">I", buf[p:p + 4])[0]
            p += 4
            t = tracks[tid]
            base = moof_start
            ddur, dsize, dflags = t["defaults"]["duration"], t["defaults"]["size"], t["defaults"]["flags"]
            if flags & 0x01:
                base = struct.unpack(">Q", buf[p:p + 8])[0]
                p += 8
            if flags & 0x02:
                p += 4
            if flags & 0x08:
                ddur = struct.unpack(">I", buf[p:p + 4])[0]
                p += 4
            if flags & 0x10:
                dsize = struct.unpack(">I", buf[p:p + 4])[0]
                p += 4
            if flags & 0x20:
                dflags = struct.unpack(">I", buf[p:p + 4])[0]
                p += 4
            tfdt = child(buf, tbody, te, "tfdt")
            decode = 0
            if tfdt:
                v = buf[tfdt[1]]
                decode = struct.unpack(">I", buf[tfdt[1] + 4:tfdt[1] + 8])[0] if v == 0 else struct.unpack(">Q", buf[tfdt[1] + 4:tfdt[1] + 12])[0]
            if t["start"] is None:
                t["start"] = decode
            for rtyp, rs, rbody, re_ in read_boxes(buf, tbody, te):
                if rtyp != "trun":
                    continue
                vf = struct.unpack(">I", buf[rbody:rbody + 4])[0]
                version, rflags = vf >> 24, vf & 0xFFFFFF
                count = struct.unpack(">I", buf[rbody + 4:rbody + 8])[0]
                q = rbody + 8
                offset = base
                if rflags & 0x01:
                    offset = base + struct.unpack(">i", buf[q:q + 4])[0]
                    q += 4
                first_flags = None
                if rflags & 0x04:
                    first_flags = struct.unpack(">I", buf[q:q + 4])[0]
                    q += 4
                for k in range(count):
                    dur, size, sflags, cts = ddur, dsize, dflags, 0
                    if rflags & 0x100:
                        dur = struct.unpack(">I", buf[q:q + 4])[0]
                        q += 4
                    if rflags & 0x200:
                        size = struct.unpack(">I", buf[q:q + 4])[0]
                        q += 4
                    if rflags & 0x400:
                        sflags = struct.unpack(">I", buf[q:q + 4])[0]
                        q += 4
                    if rflags & 0x800:
                        cts = struct.unpack(">i" if version else ">I", buf[q:q + 4])[0]
                        q += 4
                    if k == 0 and first_flags is not None:
                        sflags = first_flags
                    t["samples"].append(dict(offset=offset, size=size, dur=dur, sync=not (sflags & 0x10000), cts=cts, run=(moof_start, rs)))
                    offset += size
    return buf, tracks, order


def write(buf, tracks, order, out):
    movie_ts = 1000
    # sample data, interleaved in original order (one chunk per trun run)
    runs = []
    for tid in order:
        for smp in tracks[tid]["samples"]:
            runs.append((smp["offset"], tid, smp))
    runs.sort(key=lambda r: r[0])
    data = bytearray()
    chunks = {tid: [] for tid in order}
    last_key = None
    for _, tid, smp in runs:
        key = (tid, smp["run"])
        if key != last_key:
            chunks[tid].append([len(data), 0])
            last_key = key
        chunks[tid][-1][1] += 1
        data += buf[smp["offset"]:smp["offset"] + smp["size"]]

    def build_moov(mdat_start):
        traks = b""
        movie_dur = 0
        for tid in order:
            t = tracks[tid]
            smps = t["samples"]
            media_dur = sum(s["dur"] for s in smps)
            start = (t["start"] or 0)
            track_dur = (media_dur * movie_ts) // t["timescale"]
            lead = (start * movie_ts) // t["timescale"]
            movie_dur = max(movie_dur, track_dur + lead)
            # stts
            stts, prev, n = [], None, 0
            for s in smps:
                if s["dur"] == prev:
                    n += 1
                else:
                    if prev is not None:
                        stts.append((n, prev))
                    prev, n = s["dur"], 1
            if prev is not None:
                stts.append((n, prev))
            stbl = t["stsd"]
            stbl += fullbox("stts", 0, 0, struct.pack(">I", len(stts)) + b"".join(struct.pack(">II", a, b) for a, b in stts))
            if any(s["cts"] for s in smps):
                ctts, prev, n = [], None, 0
                for s in smps:
                    if s["cts"] == prev:
                        n += 1
                    else:
                        if prev is not None:
                            ctts.append((n, prev))
                        prev, n = s["cts"], 1
                ctts.append((n, prev))
                stbl += fullbox("ctts", 1, 0, struct.pack(">I", len(ctts)) + b"".join(struct.pack(">Ii", a, b) for a, b in ctts))
            if t["handler"] == "vide" and not all(s["sync"] for s in smps):
                sync = [i + 1 for i, s in enumerate(smps) if s["sync"]]
                stbl += fullbox("stss", 0, 0, struct.pack(">I", len(sync)) + b"".join(struct.pack(">I", i) for i in sync))
            ch = chunks[tid]
            stsc, prev = [], None
            for i, (_, count) in enumerate(ch):
                if count != prev:
                    stsc.append((i + 1, count, 1))
                    prev = count
            stbl += fullbox("stsc", 0, 0, struct.pack(">I", len(stsc)) + b"".join(struct.pack(">III", *e) for e in stsc))
            stbl += fullbox("stsz", 0, 0, struct.pack(">II", 0, len(smps)) + b"".join(struct.pack(">I", s["size"]) for s in smps))
            stbl += fullbox("co64", 0, 0, struct.pack(">I", len(ch)) + b"".join(struct.pack(">Q", mdat_start + off) for off, _ in ch))
            minf = box("minf", t["mh"] + t["dinf"] + box("stbl", stbl))
            mdhd = fullbox("mdhd", 0, 0, struct.pack(">IIIIHH", 0, 0, t["timescale"], media_dur, 0x55C4, 0))
            mdia = box("mdia", mdhd + t["hdlr"] + minf)
            # tkhd: keep the original, patch flags and duration
            tk = bytearray(t["tkhd"])
            ver = tk[8]
            tk[9:12] = (3).to_bytes(3, "big")
            if ver == 0:
                tk[28:32] = struct.pack(">I", track_dur)
            else:
                tk[36:44] = struct.pack(">Q", track_dur)
            edts = b""
            if lead > 0:
                edts = box("edts", fullbox("elst", 0, 0, struct.pack(">I", 2) + struct.pack(">IiI", lead, -1, 0x10000) + struct.pack(">IiI", track_dur, 0, 0x10000)))
            traks += box("trak", bytes(tk) + edts + mdia)
        matrix = struct.pack(">9I", 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)
        mvhd = fullbox("mvhd", 0, 0, struct.pack(">IIII", 0, 0, movie_ts, movie_dur) + struct.pack(">IH", 0x10000, 0x100) + b"\0" * 10 + matrix + b"\0" * 24 + struct.pack(">I", max(order) + 1))
        return box("moov", mvhd + traks), movie_dur

    ftyp = box("ftyp", b"isom" + struct.pack(">I", 512) + b"isomiso2avc1mp41")
    moov, _ = build_moov(0)
    big = len(data) + 8 > 0xFFFFFFFF
    mdat_hdr = 16 if big else 8
    moov, dur_ms = build_moov(len(ftyp) + len(moov) + mdat_hdr)
    with open(out, "wb") as f:
        f.write(ftyp)
        f.write(moov)
        if big:
            f.write(struct.pack(">I4sQ", 1, b"mdat", len(data) + 16))
        else:
            f.write(struct.pack(">I4s", len(data) + 8, b"mdat"))
        f.write(data)
    return dur_ms


if __name__ == "__main__":
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else str(Path(src).with_name(Path(src).stem + "-x.mp4"))
    buf, tracks, order = parse(src)
    dur = write(buf, tracks, order, dst)
    summary = ", ".join(f"{tracks[t]['handler']} {len(tracks[t]['samples'])} samples" for t in order)
    print(f"{dst}: {dur / 1000:.2f}s ({summary})")
