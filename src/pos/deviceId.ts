import { db } from '@/lib/localCopy'

// Identitas perangkat (PRD 7.5): setiap browser menyimpan device_id acak di IndexedDB. Nota menyimpannya
// sebagai keterangan saja; sejak R50 semua laptop boleh membuat nota.

const DEVICE_ID_KEY = 'device_id'

let deviceIdPromise: Promise<string> | null = null

/** device_id perangkat ini; dibuat sekali lalu disimpan di IndexedDB. */
export function getDeviceId(): Promise<string> {
  deviceIdPromise ??= (async () => {
    const has = await db.metadata.get(DEVICE_ID_KEY)
    if (has) return has.value
    const created = crypto.randomUUID()
    await db.metadata.put({ key: DEVICE_ID_KEY, value: created })
    return created
  })()
  return deviceIdPromise
}
