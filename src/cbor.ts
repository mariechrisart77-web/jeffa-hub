export function decodeCBOR(buf: Uint8Array): any {
  let pos = 0;

  function read(): any {
    const byte = buf[pos++];
    const major = byte >> 5;
    const minor = byte & 0x1f;

    if (major === 0) return readUint(minor);
    if (major === 1) return -1 - readUint(minor);
    if (major === 2) {
      const len = readUint(minor);
      const arr = buf.slice(pos, pos + len);
      pos += len;
      return arr;
    }
    if (major === 3) {
      const len = readUint(minor);
      const str = new TextDecoder().decode(buf.slice(pos, pos + len));
      pos += len;
      return str;
    }
    if (major === 4) {
      const len = readUint(minor);
      const arr: any[] = [];
      for (let i = 0; i < len; i++) arr.push(read());
      return arr;
    }
    if (major === 6) { readUint(minor); return read(); }
    if (major === 5) {
      const len = readUint(minor);
      const obj: any = {};
      for (let i = 0; i < len; i++) {
        const key = read();
        const val = read();
        obj[key] = val;
      }
      return obj;
    }
    if (major === 7 && minor === 21) return true;
    if (major === 7 && minor === 22) return false;
    if (major === 7 && minor === 23) return null;
    throw new Error(`Unsupported CBOR major ${major} minor ${minor}`);
  }

  function readUint(minor: number): number {
    if (minor < 24) return minor;
    if (minor === 24) return buf[pos++];
    if (minor === 25) return (buf[pos++] << 8) | buf[pos++];
    if (minor === 26) return ((buf[pos++] << 24) >>> 0) + ((buf[pos++] << 16) | (buf[pos++] << 8) | buf[pos++]);
    throw new Error(`Unsupported uint minor ${minor}`);
  }

  return read();
}
