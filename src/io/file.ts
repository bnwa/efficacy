import { encodeBase64 } from '@sigma/rust-base64'
import { utf8FromStr } from './str'

export async function base64FromFile(file: File): Promise<string> {
  const buffer= await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  return encodeBase64(bytes)
}

export async function strFromFile(file: File) {
  return await file.text()
}

export async function utf8FromFile(file: File) {
  const utf16 = await file.text()
  return utf8FromStr(utf16)
}
