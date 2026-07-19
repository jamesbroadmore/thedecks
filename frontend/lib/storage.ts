import { createReadStream } from 'fs'
import { mkdir, stat, unlink, writeFile } from 'fs/promises'
import { dirname, join, normalize } from 'path'

const ROOT = process.env.STORAGE_DIR || '/app/storage'

// When a Vercel Blob token is present (i.e. on Vercel), object storage is backed
// by Vercel Blob. Otherwise files are stored on the local filesystem, which is
// what the Emergent preview / any self-hosted deployment uses.
export const usingBlob = !!process.env.BLOB_READ_WRITE_TOKEN

export interface StoredObject {
  pathname: string
  url: string | null
}

function resolvePath(pathname: string) {
  const clean = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '')
  return join(ROOT, clean)
}

export async function putObject(
  pathname: string,
  data: Buffer | Uint8Array,
  contentType?: string
): Promise<StoredObject> {
  if (usingBlob) {
    const { put } = await import('@vercel/blob')
    const res = await put(pathname, Buffer.from(data), {
      access: 'public',
      addRandomSuffix: false,
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return { pathname: res.pathname, url: res.url }
  }
  const full = resolvePath(pathname)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, data)
  return { pathname, url: null }
}

export async function deleteObject(pathname: string | null, url?: string | null) {
  if (usingBlob) {
    if (url) {
      try {
        const { del } = await import('@vercel/blob')
        await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN })
      } catch {
        /* ignore */
      }
    }
    return
  }
  if (!pathname) return
  try {
    await unlink(resolvePath(pathname))
  } catch {
    /* ignore missing files */
  }
}

export function objectAbsolutePath(pathname: string) {
  return resolvePath(pathname)
}

export async function objectStat(pathname: string) {
  try {
    return await stat(resolvePath(pathname))
  } catch {
    return null
  }
}

export function objectReadStream(pathname: string, opts?: { start: number; end: number }) {
  return createReadStream(resolvePath(pathname), opts)
}
