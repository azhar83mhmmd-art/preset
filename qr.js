'use strict';
/* PresetFlow — generator QR code mandiri (mode byte, koreksi error level M, versi 1-10). Tanpa dependensi, tanpa jaringan. */
(function (root) {
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsRem(data, n) { const g = rsGen(n), res = new Array(n).fill(0); for (const b of data) { const f = b ^ res.shift(); res.push(0); for (let i = 0; i < n; i++) res[i] ^= mul(g[i + 1], f); } return res; }

  const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]; // level M
  function rawModules(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; } return r; }
  const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];
  function alignPos(v) {
    if (v === 1) return []; const n = Math.floor(v / 7) + 2, size = v * 4 + 17, step = Math.floor((v * 8 + n * 3 + 5) / (n * 4 - 4)) * 2, r = [6];
    for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p); return r;
  }
  const utf8 = (s) => Array.from(new TextEncoder().encode(s));

  function encode(text) {
    const bytes = utf8(text); let ver = 0;
    for (let v = 1; v <= 10; v++) { const cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCodewords(v) * 8) { ver = v; break; } }
    if (!ver) throw new Error('Teks terlalu panjang untuk QR');
    const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
    const cap = dataCodewords(ver) * 8; put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    // bagi ke blok + hitung ECC + interleave
    const nb = NUM_BLOCKS[ver], eb = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8), shortN = nb - (raw % nb), shortLen = Math.floor(raw / nb), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k + shortLen - eb + (i < shortN ? 0 : 1)); k += d.length; const e = rsRem(d, eb); if (i < shortN) d.push(0); blocks.push(d.concat(e)); }
    const out = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eb || j >= shortN) out.push(b[i]); });
    return { ver, codewords: out };
  }

  function build(text) {
    const { ver, codewords } = encode(text), size = ver * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { if (x >= 0 && y >= 0 && x < size && y < size) { m[y][x] = !!d; fn[y][x] = true; } };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } });
    const ap = alignPos(ver), last = ap.length - 1;
    ap.forEach((py, i) => ap.forEach((px, j) => { if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const formatBits = (mask) => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); return ((d << 10) | r) ^ 0x5412; };
    const drawFormat = (mask) => {
      const b = formatBits(mask), bit = (i) => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i)); set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (ver << 12) | r; for (let i = 0; i < 18; i++) { const bt = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bt); set(c, a, bt); } }
    // tempatkan data zig-zag
    let idx = 0; const total = codewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && idx < total) { m[y][x] = ((codewords[idx >>> 3] >>> (7 - (idx & 7))) & 1) === 1; idx++; }
      }
    }
    const cond = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const applyMask = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && cond[k](x, y)) m[y][x] = !m[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0; const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = pat.slice().reverse();
      const line = (get) => { // aturan 1 dan 3 untuk satu baris/kolom
        let run = 1; for (let i = 1; i < size; i++) { if (get(i) === get(i - 1)) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } } if (run >= 5) p += 3 + run - 5;
        for (let i = 0; i + 11 <= size; i++) { let a = true, b = true; for (let k = 0; k < 11; k++) { const v = get(i + k) ? 1 : 0; if (v !== pat[k]) a = false; if (v !== pat2[k]) b = false; } if (a || b) p += 40; }
      };
      for (let y = 0; y < size; y++) line((i) => m[y][i]); for (let x = 0; x < size; x++) line((i) => m[i][x]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) dark++;
      p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10; return p;
    };
    let best = 0, bestP = Infinity;
    for (let k = 0; k < 8; k++) { applyMask(k); drawFormat(k); const p = penalty(); if (p < bestP) { bestP = p; best = k; } applyMask(k); } // XOR dua kali = kembali
    applyMask(best); drawFormat(best);
    return m;
  }

  /* svg(text, {fg, bg, quiet}) -> string SVG; png(text, px, fg, bg) -> Promise<Blob> */
  function svg(text, o) {
    o = o || {}; const m = build(text), q = o.quiet == null ? 3 : o.quiet, n = m.length + q * 2; let d = '';
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="' + (o.bg || '#fff') + '"/><path d="' + d + '" fill="' + (o.fg || '#000') + '"/></svg>';
  }
  function png(text, px) {
    const m = build(text), q = 3, n = m.length + q * 2, scale = Math.max(4, Math.floor((px || 512) / n)), c = document.createElement('canvas'); c.width = c.height = n * scale;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) g.fillRect((x + q) * scale, (y + q) * scale, scale, scale);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  root.PFQR = { matrix: build, svg, png };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PFQR;
})(typeof window !== 'undefined' ? window : globalThis);
