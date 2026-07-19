export type Track = {
  id: string
  title: string
  artist: string
  fileName: string
  contentType: string
  size: number
  duration: number | null
  bpm: number | null
  musicalKey: string | null
  coverArt: string | null
  genre: string | null
  deviceSourceId: string | null
  metadata: any
  createdAt: string
}

export type Recording = {
  id: string
  title: string
  duration: number | null
  createdAt: string
}

export type DeviceSource = {
  id: string
  type: string
  path: string
  label: string
  enabled: boolean
  lastScanned: string | null
  createdAt: string
}
