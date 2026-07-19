'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR, { type KeyedMutator } from 'swr'
import {
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import type { DeviceSource, Track } from '@/lib/types'

const fetcher = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    throw new Error(body?.error || 'Request failed')
  }
  return r.json()
}

async function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    const url = URL.createObjectURL(file)
    const done = (n: number) => {
      URL.revokeObjectURL(url)
      resolve(n)
    }
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0)
    a.onerror = () => done(0)
    a.src = url
  })
}

export function SourcesPanel({
  tracks,
  mutateTracks,
}: {
  tracks: Track[]
  mutateTracks: KeyedMutator<Track[]>
}) {
  const { data: sources = [], error: sourcesError, mutate: mutateSources } = useSWR<DeviceSource[]>('/api/device-sources', fetcher)
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info')
  const [path, setPath] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState('local_folder')
  const [addingSource, setAddingSource] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (progressTimer.current) clearTimeout(progressTimer.current)
    },
    []
  )

  function say(message: string, kind: 'info' | 'error' = 'info') {
    setStatus(message)
    setStatusKind(kind)
  }

  async function importFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aac|ogg|aiff?)$/i.test(f.name))
    if (files.length === 0) {
      say('No audio files found in the selection.', 'error')
      return
    }
    setImporting(true)
    setProgress({ done: 0, total: files.length })
    let ok = 0
    let failed = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const duration = await readDuration(file)
        const base = file.name.replace(/\.[^.]+$/, '')
        const parts = base.split(' - ')
        const form = new FormData()
        form.set('file', file)
        form.set('title', parts.length > 1 ? parts.slice(1).join(' - ') : base)
        form.set('artist', parts.length > 1 ? parts[0] : 'Unknown Artist')
        form.set('duration', String(duration))
        const res = await fetch('/api/tracks', { method: 'POST', body: form })
        if (res.ok) ok++
        else failed++
      } catch {
        failed++
      }
      setProgress({ done: i + 1, total: files.length })
    }
    await mutateTracks()
    setImporting(false)
    say(
      `Imported ${ok} of ${files.length} file${files.length > 1 ? 's' : ''} into your library.${failed ? ` ${failed} failed.` : ''}`,
      failed && !ok ? 'error' : 'info'
    )
    if (progressTimer.current) clearTimeout(progressTimer.current)
    progressTimer.current = setTimeout(() => setProgress(null), 1500)
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault()
    if (!path.trim() || addingSource) return
    setAddingSource(true)
    try {
      const res = await fetch('/api/device-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, path: path.trim(), label: label.trim() || path.trim() }),
      })
      if (res.ok) {
        setPath('')
        setLabel('')
        say('Source added. Scan it to import its audio files.')
        await mutateSources()
      } else {
        const body = await res.json().catch(() => null)
        say(body?.error || 'Could not add source', 'error')
      }
    } catch {
      say('Could not add source. Check your connection and try again.', 'error')
    } finally {
      setAddingSource(false)
    }
  }

  async function scan(id: string) {
    setScanning(id)
    setStatus('')
    try {
      const res = await fetch(`/api/device-sources/${id}/scan`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (res.ok && json) {
        say(
          `Scan complete — imported ${json.scanned} new track${json.scanned === 1 ? '' : 's'}${json.skipped ? `, skipped ${json.skipped} already in library` : ''}.`
        )
        await mutateTracks()
        await mutateSources()
      } else {
        say(json?.error || 'Scan failed', 'error')
      }
    } catch {
      say('Scan failed. Check your connection and try again.', 'error')
    } finally {
      setScanning(null)
    }
  }

  async function removeSource(id: string) {
    if (!confirm('Remove this source? (Tracks already imported stay in your library.)')) return
    try {
      const res = await fetch(`/api/device-sources?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        say(body?.error || 'Could not remove the source', 'error')
      } else {
        await mutateSources()
      }
    } catch {
      say('Could not remove the source.', 'error')
    }
  }

  return (
    <div className="feature-panel" data-testid="sources-panel">
      <div className="feature-head">
        <p className="eyebrow">
          <HardDrive aria-hidden="true" />
          LOCAL SOURCES
        </p>
        <h1>Bring your own music</h1>
        <p className="feature-sub">
          Import files straight from this device, or register folders on the server for repeatable scans.
        </p>
      </div>

      <div className="source-grid">
        <section className="source-card" aria-label="Import from this device">
          <header>
            <Upload aria-hidden="true" />
            <div>
              <b>From this device</b>
              <small>Browser import — pick files or a whole folder</small>
            </div>
          </header>
          <input
            ref={filesRef}
            hidden
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => {
              importFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={folderRef}
            hidden
            type="file"
            // @ts-expect-error non-standard directory picker attributes
            webkitdirectory=""
            directory=""
            multiple
            onChange={(e) => {
              importFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <div className="source-actions">
            <button type="button" className="primary-action" disabled={importing} onClick={() => filesRef.current?.click()} data-testid="import-files-button">
              {importing ? <LoaderCircle className="spin" /> : <Upload />}
              {importing ? 'Importing' : 'Import files'}
            </button>
            <button type="button" className="ghost-action" disabled={importing} onClick={() => folderRef.current?.click()} data-testid="import-folder-button">
              <FolderOpen />
              Import folder
            </button>
          </div>
          {progress && (
            <div className="progress-line" data-testid="import-progress">
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label="Import progress"
              >
                <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <small>
                {progress.done} / {progress.total}
              </small>
            </div>
          )}
        </section>

        <section className="source-card" aria-label="Server folders">
          <header>
            <HardDrive aria-hidden="true" />
            <div>
              <b>Server folders</b>
              <small>Scan a directory on the host (local / SMB / NFS mount)</small>
            </div>
          </header>
          <form className="source-form" onSubmit={addSource}>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Source type" data-testid="source-type-select">
              <option value="local_folder">Local folder</option>
              <option value="smb_share">SMB share</option>
              <option value="nfs_share">NFS share</option>
            </select>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/app/sample-music"
              aria-label="Folder path"
              required
              data-testid="source-path-input"
            />
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" aria-label="Source label" data-testid="source-label-input" />
            <button className="primary-action" disabled={addingSource || !path.trim()} data-testid="add-source-button">
              {addingSource ? <LoaderCircle className="spin" /> : <Plus />}
              Add source
            </button>
          </form>
          <small className="hint">Tip: try the bundled demo folder <code>/app/sample-music</code>.</small>
        </section>
      </div>

      {status && (
        <p className={`status-line ${statusKind === 'error' ? 'error' : ''}`} role="status" data-testid="sources-status">
          {status}
        </p>
      )}

      <section className="sources-list" aria-label="Registered sources">
        <h2>Registered sources</h2>
        {sourcesError ? (
          <p className="status-line error">Could not load sources: {sourcesError.message}</p>
        ) : sources.length === 0 ? (
          <p className="muted">No server folders yet. Add one above to scan it for audio.</p>
        ) : (
          <div className="sources-rows" data-testid="sources-list">
            {sources.map((s) => (
              <article key={s.id} data-testid={`source-row-${s.id}`}>
                <div className="source-meta">
                  <b>{s.label}</b>
                  <small>
                    {s.type.replace('_', ' ')} · {s.path}
                  </small>
                  <small className="muted">{s.lastScanned ? `Last scanned ${new Date(s.lastScanned).toLocaleString()}` : 'Never scanned'}</small>
                </div>
                <div className="source-row-actions">
                  <button type="button" className="ghost-action" disabled={scanning === s.id} onClick={() => scan(s.id)} data-testid={`scan-source-${s.id}`}>
                    {scanning === s.id ? <LoaderCircle className="spin" /> : <RefreshCw />}
                    {scanning === s.id ? 'Scanning' : 'Scan'}
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => removeSource(s.id)}
                    aria-label={`Remove source ${s.label}`}
                    data-testid={`remove-source-${s.id}`}
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="muted small">Your library currently holds {tracks.length} track{tracks.length === 1 ? '' : 's'}.</p>
      </section>
    </div>
  )
}
