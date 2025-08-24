import { encodeBase64 as toBase64 } from '@sigma/rust-base64';
import { decodeBase64 as fromBase64 } from '@sigma/rust-base64';

const utf8Decoder = new TextDecoder('utf-8')
const utf8Encoder = new TextEncoder

export async function utf8FromStr(str: string) {
  return utf8Encoder.encode(str)
}

export async function strFromUtf8(bytes: Uint8Array) {
  return utf8Decoder.decode(bytes)
}

export async function base64FromStr(str: string) {
  const bytes = await utf8FromStr(str)
  return toBase64(bytes)
}

export async function strFromBase64(base64: string) {
  const bytes = await utf8FromStr(base64)
  return await strFromUtf8(fromBase64(bytes))
}
