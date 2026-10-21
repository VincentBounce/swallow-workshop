/** Encodes mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: ArrayLike<number>, fs: number): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

/** Decodes a 16-bit or float PCM WAV (first channel). */
export function decodeWav(data: Uint8Array): { samples: Float32Array; fs: number } {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 12;
  let fs = 48000, bits = 16, ch = 1, fmt = 1;
  let samples = new Float32Array(0);
  while (p + 8 <= data.length) {
    const id = String.fromCharCode(data[p], data[p + 1], data[p + 2], data[p + 3]);
    const size = v.getUint32(p + 4, true);
    if (id === 'fmt ') {
      fmt = v.getUint16(p + 8, true); ch = v.getUint16(p + 10, true);
      fs = v.getUint32(p + 12, true); bits = v.getUint16(p + 22, true);
    } else if (id === 'data') {
      const bytes = bits / 8;
      const n = Math.floor(size / (bytes * ch));
      samples = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = p + 8 + i * bytes * ch;
        if (fmt === 3 && bits === 32) samples[i] = v.getFloat32(o, true);
        else if (bits === 16) samples[i] = v.getInt16(o, true) / 32768;
        else if (bits === 24) samples[i] = ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16))) / 8388608;
        else if (bits === 32) samples[i] = v.getInt32(o, true) / 2147483648;
      }
    }
    p += 8 + size + (size & 1);
  }
  return { samples, fs };
}
