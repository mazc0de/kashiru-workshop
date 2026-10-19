import { useEffect, useState } from 'react'

import { unwrap } from '@/lib/errors'
import { readStored, removeStored, writeStored } from '@/lib/localStore'
import { supabase } from '@/lib/supabase'

// Logo bengkel di bucket Storage privat "logo" (PRD 4.14). Salinannya disimpan di perangkat sebagai
// data URL supaya tetap tercetak di struk saat offline.

const KEY = 'kashiru.logo'
const BUCKET = 'logo'
export const MAX_LOGO_SIZE = 200 * 1024

type LogoCopy = { path: string; dataUrl: string }

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, failed) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => failed(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Data URL logo untuk path di pengaturan, dari salinan perangkat atau diunduh sekali. */
export function useLogo(path: string | null | undefined): string | null {
  const [copies, setCopies] = useState<LogoCopy | null>(() => readStored<LogoCopy>(KEY))

  useEffect(() => {
    if (path === undefined) return
    if (path === null) {
      removeStored(KEY)
      return
    }
    if (copies?.path === path) return
    let cancel = false
    void supabase()
      .storage.from(BUCKET)
      .download(path)
      .then(async ({ data }) => {
        if (!data || cancel) return
        const created = { path, dataUrl: await toDataUrl(data) }
        writeStored(KEY, created)
        setCopies(created)
      })
    return () => {
      cancel = true
    }
  }, [path, copies?.path])

  return path && copies?.path === path ? copies.dataUrl : null
}

/** Unggah logo baru dan kembalikan path-nya. PNG atau JPG, paling besar 200 KB. */
export async function uploadLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Logo harus berupa gambar PNG atau JPG.')
  if (file.size > MAX_LOGO_SIZE) throw new Error('Ukuran logo paling besar 200 KB.')
  const path = `logo-${Date.now()}.${file.type === 'image/png' ? 'png' : 'jpg'}`
  unwrap(await supabase().storage.from(BUCKET).upload(path, file, { contentType: file.type }))
  return path
}

export async function deleteLogoFile(path: string): Promise<void> {
  await supabase().storage.from(BUCKET).remove([path])
}
