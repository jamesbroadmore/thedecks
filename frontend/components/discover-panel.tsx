'use client'

import { useState } from 'react'
import { type KeyedMutator } from 'swr'
import { Compass, Download, ExternalLink, LoaderCircle, Music, Search } from 'lucide-react'
import type { CatalogItem, CatalogSource } from '@/lib/catalog'
import type { Track } from '@/lib/types'

const SOURCE_META: Record<CatalogSource, { label: string; color: string }> = {
  internet_archive: { label: 'Internet Archive', color: '#ffb347' },
  ccmixter: { label: 'ccMixter', color: '#20e3d2' },
  jamendo: { label: 'Jamendo', color: '#8b9dff' },
}

export function DiscoverPanel({ mutateTracks }: { mutateTracks: KeyedMutator<Track[]> }) {
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState<Record<CatalogSource, boolean>>({
    internet_archive: true,
    ccmixter: true,
    jamendo: true,
  })
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CatalogItem[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [searched, setSearched] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [imported, setImported] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const active = (Object.keys(sources) as CatalogSource[]).filter((s) => sources[s])
      const res = await fetch(`/api/catalog?q=${encodeURIComponent(query.trim())}&sources=${active.join(',')}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Search failed')
      setResults(json.results || [])
      setNotes(json.notes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  async function importItem(item: CatalogItem) {
    setImporting(item.id)
    try {
      const res = await fetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: item.source,
          downloadUrl: item.downloadUrl,
          title: item.title,
          artist: item.artist,
          license: item.license,
          pageUrl: item.pageUrl,
          cover: item.cover,
          duration: item.duration,
        }),
      })
      if (res.ok) {
        setImported((m) => ({ ...m, [item.id]: true }))
        await mutateTracks()
      } else {
        setError((await res.json()).error || 'Import failed')
      }
    } catch {
      setError('Import failed')
    } finally {
      setImporting(null)
    }
  }

  return (
    <div className="feature-panel" data-testid="discover-panel">
      <div className="feature-head">
        <p className="eyebrow">
          <Compass />
          OPEN-SOURCE CATALOG
        </p>
        <h1>Discover free &amp; remixable music</h1>
        <p className="feature-sub">
          Search royalty-free and Creative Commons catalogs — Internet Archive, ccMixter and Jamendo — and import straight into your library.
        </p>
      </div>

      <form className="discover-search" onSubmit={search}>
        <label className="search big">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artists, tracks, moods…"
            data-testid="catalog-search-input"
          />
        </label>
        <button className="primary-action" disabled={loading} data-testid="catalog-search-button">
          {loading ? <LoaderCircle className="spin" /> : <Search />}
          Search
        </button>
      </form>

      <div className="source-toggles" data-testid="source-toggles">
        {(Object.keys(SOURCE_META) as CatalogSource[]).map((s) => (
          <button
            key={s}
            className={`chip ${sources[s] ? 'on' : ''}`}
            onClick={() => setSources((m) => ({ ...m, [s]: !m[s] }))}
            style={sources[s] ? { borderColor: SOURCE_META[s].color, color: SOURCE_META[s].color } : {}}
            data-testid={`source-toggle-${s}`}
          >
            {SOURCE_META[s].label}
          </button>
        ))}
      </div>

      {error && <p className="status-line error" data-testid="discover-error">{error}</p>}
      {notes.map((n, i) => (
        <p key={i} className="muted small note">
          {n}
        </p>
      ))}

      {loading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
          <b>Searching open catalogs…</b>
        </div>
      ) : results.length > 0 ? (
        <div className="catalog-grid" data-testid="catalog-results">
          {results.map((item) => (
            <article key={item.id} className="catalog-card" data-testid={`catalog-item-${item.id}`}>
              <div className="catalog-cover" style={item.cover ? { backgroundImage: `url(${item.cover})` } : {}}>
                {!item.cover && <Music />}
                <span className="source-badge" style={{ background: SOURCE_META[item.source].color }}>
                  {SOURCE_META[item.source].label}
                </span>
              </div>
              <div className="catalog-body">
                <b title={item.title}>{item.title}</b>
                <small>{item.artist}</small>
                {item.license && <small className="muted lic">{item.license}</small>}
                {item.previewUrl && (
                  <audio controls preload="none" src={item.previewUrl} className="catalog-audio" data-testid={`catalog-preview-${item.id}`} />
                )}
                <div className="catalog-actions">
                  <button
                    className="primary-action sm"
                    disabled={importing === item.id || imported[item.id]}
                    onClick={() => importItem(item)}
                    data-testid={`import-item-${item.id}`}
                  >
                    {importing === item.id ? <LoaderCircle className="spin" /> : <Download />}
                    {imported[item.id] ? 'In library' : 'Add to library'}
                  </button>
                  {item.pageUrl && (
                    <a className="icon-button" href={item.pageUrl} target="_blank" rel="noreferrer" aria-label="Open source page">
                      <ExternalLink />
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : searched ? (
        <div className="empty-state" data-testid="catalog-empty">
          <Compass />
          <b>No results</b>
          <p>Try a different query or enable more sources.</p>
        </div>
      ) : (
        <div className="empty-state">
          <Compass />
          <b>Search the open web of music</b>
          <p>Everything here is free to use — always check each track&apos;s license before public performance.</p>
        </div>
      )}
    </div>
  )
}
