/**
 * 浏览器与 Node 共用的同步 SHA-1 / MD5（财联社列表签名需要）。
 * 不引入第三方依赖。
 */

function toBytes(input: string): Uint8Array {
  const out = new Uint8Array(input.length)
  for (let i = 0; i < input.length; i += 1) out[i] = input.charCodeAt(i) & 0xff
  return out
}

function rotr(n: number, b: number): number {
  return (n >>> b) | (n << (32 - b))
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0')
  }
  return out
}

/** SHA-1 hex digest of a UTF-8-ish latin1 string (URLSearchParams ASCII). */
export function sha1Hex(message: string): string {
  const msg = toBytes(message)
  const ml = msg.length
  const withOne = new Uint8Array(((ml + 9 + 63) >> 6) << 6)
  withOne.set(msg)
  withOne[ml] = 0x80
  const bitLen = ml * 8
  const view = new DataView(withOne.buffer)
  view.setUint32(withOne.length - 4, bitLen >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)

  for (let i = 0; i < withOne.length; i += 64) {
    for (let j = 0; j < 16; j += 1) w[j] = view.getUint32(i + j * 4)
    for (let j = 16; j < 80; j += 1) {
      w[j] = rotr(w[j - 3]! ^ w[j - 8]! ^ w[j - 14]! ^ w[j - 16]!, 31)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let j = 0; j < 80; j += 1) {
      let f: number
      let k: number
      if (j < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (j < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (rotr(a, 27) + f + e + k + w[j]!) >>> 0
      e = d
      d = c
      c = rotr(b, 2)
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0)
  outView.setUint32(4, h1)
  outView.setUint32(8, h2)
  outView.setUint32(12, h3)
  outView.setUint32(16, h4)
  return bytesToHex(out)
}

function md5Cm(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return (rotr((a + q + x + t) >>> 0, 32 - s) + b) >>> 0
}

/** MD5 hex digest of a UTF-8-ish latin1 string. */
export function md5Hex(message: string): string {
  const msg = toBytes(message)
  const ml = msg.length
  const withOne = new Uint8Array(((ml + 9 + 63) >> 6) << 6)
  withOne.set(msg)
  withOne[ml] = 0x80
  const bitLen = ml * 8
  const view = new DataView(withOne.buffer)
  view.setUint32(withOne.length - 8, bitLen >>> 0, true)
  view.setUint32(withOne.length - 4, Math.floor(bitLen / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let i = 0; i < withOne.length; i += 64) {
    const m = new Uint32Array(16)
    for (let j = 0; j < 16; j += 1) m[j] = view.getUint32(i + j * 4, true)
    let a = a0
    let b = b0
    let c = c0
    let d = d0

    a = md5Cm((b & c) | (~b & d), a, b, m[0]!, 7, 0xd76aa478)
    d = md5Cm((a & b) | (~a & c), d, a, m[1]!, 12, 0xe8c7b756)
    c = md5Cm((d & a) | (~d & b), c, d, m[2]!, 17, 0x242070db)
    b = md5Cm((c & d) | (~c & a), b, c, m[3]!, 22, 0xc1bdceee)
    a = md5Cm((b & c) | (~b & d), a, b, m[4]!, 7, 0xf57c0faf)
    d = md5Cm((a & b) | (~a & c), d, a, m[5]!, 12, 0x4787c62a)
    c = md5Cm((d & a) | (~d & b), c, d, m[6]!, 17, 0xa8304613)
    b = md5Cm((c & d) | (~c & a), b, c, m[7]!, 22, 0xfd469501)
    a = md5Cm((b & c) | (~b & d), a, b, m[8]!, 7, 0x698098d8)
    d = md5Cm((a & b) | (~a & c), d, a, m[9]!, 12, 0x8b44f7af)
    c = md5Cm((d & a) | (~d & b), c, d, m[10]!, 17, 0xffff5bb1)
    b = md5Cm((c & d) | (~c & a), b, c, m[11]!, 22, 0x895cd7be)
    a = md5Cm((b & c) | (~b & d), a, b, m[12]!, 7, 0x6b901122)
    d = md5Cm((a & b) | (~a & c), d, a, m[13]!, 12, 0xfd987193)
    c = md5Cm((d & a) | (~d & b), c, d, m[14]!, 17, 0xa679438e)
    b = md5Cm((c & d) | (~c & a), b, c, m[15]!, 22, 0x49b40821)

    a = md5Cm((b & d) | (c & ~d), a, b, m[1]!, 5, 0xf61e2562)
    d = md5Cm((a & c) | (b & ~c), d, a, m[6]!, 9, 0xc040b340)
    c = md5Cm((d & b) | (a & ~b), c, d, m[11]!, 14, 0x265e5a51)
    b = md5Cm((c & a) | (d & ~a), b, c, m[0]!, 20, 0xe9b6c7aa)
    a = md5Cm((b & d) | (c & ~d), a, b, m[5]!, 5, 0xd62f105d)
    d = md5Cm((a & c) | (b & ~c), d, a, m[10]!, 9, 0x02441453)
    c = md5Cm((d & b) | (a & ~b), c, d, m[15]!, 14, 0xd8a1e681)
    b = md5Cm((c & a) | (d & ~a), b, c, m[4]!, 20, 0xe7d3fbc8)
    a = md5Cm((b & d) | (c & ~d), a, b, m[9]!, 5, 0x21e1cde6)
    d = md5Cm((a & c) | (b & ~c), d, a, m[14]!, 9, 0xc33707d6)
    c = md5Cm((d & b) | (a & ~b), c, d, m[3]!, 14, 0xf4d50d87)
    b = md5Cm((c & a) | (d & ~a), b, c, m[8]!, 20, 0x455a14ed)
    a = md5Cm((b & d) | (c & ~d), a, b, m[13]!, 5, 0xa9e3e905)
    d = md5Cm((a & c) | (b & ~c), d, a, m[2]!, 9, 0xfcefa3f8)
    c = md5Cm((d & b) | (a & ~b), c, d, m[7]!, 14, 0x676f02d9)
    b = md5Cm((c & a) | (d & ~a), b, c, m[12]!, 20, 0x8d2a4c8a)

    a = md5Cm(b ^ c ^ d, a, b, m[5]!, 4, 0xfffa3942)
    d = md5Cm(a ^ b ^ c, d, a, m[8]!, 11, 0x8771f681)
    c = md5Cm(d ^ a ^ b, c, d, m[11]!, 16, 0x6d9d6122)
    b = md5Cm(c ^ d ^ a, b, c, m[14]!, 23, 0xfde5380c)
    a = md5Cm(b ^ c ^ d, a, b, m[1]!, 4, 0xa4beea44)
    d = md5Cm(a ^ b ^ c, d, a, m[4]!, 11, 0x4bdecfa9)
    c = md5Cm(d ^ a ^ b, c, d, m[7]!, 16, 0xf6bb4b60)
    b = md5Cm(c ^ d ^ a, b, c, m[10]!, 23, 0xbebfbc70)
    a = md5Cm(b ^ c ^ d, a, b, m[13]!, 4, 0x289b7ec6)
    d = md5Cm(a ^ b ^ c, d, a, m[0]!, 11, 0xeaa127fa)
    c = md5Cm(d ^ a ^ b, c, d, m[3]!, 16, 0xd4ef3085)
    b = md5Cm(c ^ d ^ a, b, c, m[6]!, 23, 0x04881d05)
    a = md5Cm(b ^ c ^ d, a, b, m[9]!, 4, 0xd9d4d039)
    d = md5Cm(a ^ b ^ c, d, a, m[12]!, 11, 0xe6db99e5)
    c = md5Cm(d ^ a ^ b, c, d, m[15]!, 16, 0x1fa27cf8)
    b = md5Cm(c ^ d ^ a, b, c, m[2]!, 23, 0xc4ac5665)

    a = md5Cm(c ^ (b | ~d), a, b, m[0]!, 6, 0xf4292244)
    d = md5Cm(b ^ (a | ~c), d, a, m[7]!, 10, 0x432aff97)
    c = md5Cm(a ^ (d | ~b), c, d, m[14]!, 15, 0xab9423a7)
    b = md5Cm(d ^ (c | ~a), b, c, m[5]!, 21, 0xfc93a039)
    a = md5Cm(c ^ (b | ~d), a, b, m[12]!, 6, 0x655b59c3)
    d = md5Cm(b ^ (a | ~c), d, a, m[3]!, 10, 0x8f0ccc92)
    c = md5Cm(a ^ (d | ~b), c, d, m[10]!, 15, 0xffeff47d)
    b = md5Cm(d ^ (c | ~a), b, c, m[1]!, 21, 0x85845dd1)
    a = md5Cm(c ^ (b | ~d), a, b, m[8]!, 6, 0x6fa87e4f)
    d = md5Cm(b ^ (a | ~c), d, a, m[15]!, 10, 0xfe2ce6e0)
    c = md5Cm(a ^ (d | ~b), c, d, m[6]!, 15, 0xa3014314)
    b = md5Cm(d ^ (c | ~a), b, c, m[13]!, 21, 0x4e0811a1)
    a = md5Cm(c ^ (b | ~d), a, b, m[4]!, 6, 0xf7537e82)
    d = md5Cm(b ^ (a | ~c), d, a, m[11]!, 10, 0xbd3af235)
    c = md5Cm(a ^ (d | ~b), c, d, m[2]!, 15, 0x2ad7d2bb)
    b = md5Cm(d ^ (c | ~a), b, c, m[9]!, 21, 0xeb86d391)

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0, true)
  outView.setUint32(4, b0, true)
  outView.setUint32(8, c0, true)
  outView.setUint32(12, d0, true)
  return bytesToHex(out)
}
