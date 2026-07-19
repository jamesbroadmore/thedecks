# Open-Source & Free APIs Integrated

## 🎵 Metadata Enrichment

### MusicBrainz (Free, No Auth)
- **Endpoint**: `https://musicbrainz.org/ws/2/`
- **Features**: Track lookup, ISRC code, artist/album metadata
- **Rate Limit**: 1 req/sec per IP
- **Implementation**: `lib/metadata-enricher.ts`
- **API Endpoint**: `POST /api/tracks/enrich`

### Cover Art Archive (Free, No Auth)
- **Endpoint**: `https://coverartarchive.org/`
- **Features**: High-quality album artwork via MusicBrainz IDs
- **Rate Limit**: Generous (no specific limit)
- **Integrated**: Within MusicBrainz enrichment flow

## 🎸 Recommendations & Analytics

### Last.fm (Free Tier with API Key)
- **Endpoint**: `http://ws.audioscrobbler.com/2.0/`
- **Features**: Similar tracks, artist info, track statistics
- **Auth**: Requires `LASTFM_API_KEY` environment variable
- **Implementation**: `lib/lastfm-client.ts`
- **API Endpoint**: `POST /api/recommendations`

## 📁 Device Sources & Local Library

### Local Folder Scanning
- **Supported Formats**: MP3, WAV, FLAC, M4A, AAC, OGG, WMA, AIFF
- **Metadata Extraction**: `music-metadata` npm package
- **Features**: Auto-detect BPM, key, duration, genre
- **Implementation**: `app/api/device-sources/[id]/scan/route.ts`

### Device Source Types
1. **local_folder** - Local filesystem paths
2. **smb_share** - SMB/CIFS network shares
3. **nfs_share** - NFS mounted directories

## 🔧 API Endpoints

### Library Management
```bash
GET /api/tracks                    # List user library
POST /api/tracks/enrich           # Enrich track with MusicBrainz + Cover Art
```

### Device Sources
```bash
GET /api/device-sources           # List device sources
POST /api/device-sources          # Add new device source
POST /api/device-sources/[id]/scan # Scan and import tracks
```

### AI Recommendations
```bash
POST /api/recommendations         # Get similar tracks (Last.fm or BPM-based)
```

## 📝 Environment Variables (Optional)

```bash
# Optional: Last.fm recommendations
LASTFM_API_KEY=your_api_key

# Optional: Genius lyrics
GENIUS_API_KEY=your_api_key
```

No API keys are required for core functionality—MusicBrainz and Cover Art Archive work without authentication. Add keys to enable additional features like Last.fm recommendations.

## 🚀 Usage Examples

### Enrich a Track
```typescript
POST /api/tracks/enrich
{
  "trackId": "track-uuid"
}
```

### Add Device Source
```typescript
POST /api/device-sources
{
  "type": "local_folder",
  "path": "/path/to/music",
  "label": "My Local Library"
}
```

### Scan Device
```typescript
POST /api/device-sources/{id}/scan
// Returns: { success: true, scanned: 42, tracks: [...] }
```

### Get Recommendations
```typescript
POST /api/recommendations
{
  "trackId": "track-uuid",
  "limit": 5
}
```

## 📊 Data Flow

1. **Upload/Scan** → Extract metadata (music-metadata)
2. **Enrich** → MusicBrainz lookup + Cover Art Archive
3. **Recommend** → Last.fm similar tracks or BPM similarity fallback
4. **Store** → Per-user database with rich metadata
5. **Stream** → Private Blob-backed secure playback
