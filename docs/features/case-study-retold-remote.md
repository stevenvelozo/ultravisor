# Case Study: retold-remote + orator-conversion

This case study shows how retold-remote (a media browser) and orator-conversion (a media processing worker) integrate through Ultravisor's operation pipeline to generate thumbnails, previews, waveforms, and other derived media artifacts.

## System Overview

```mermaid
graph TB
    subgraph "retold-remote (NAS)"
        RR[retold-remote server]
        FS[(Media Files<br/>/Users/steven)]
        RR --- FS
    end

    subgraph "Ultravisor (Coordinator)"
        UV[Ultravisor API Server]
        OPS[(Operation Graphs)]
        RM[Reachability Matrix]
        UV --- OPS
        UV --- RM
    end

    subgraph "orator-conversion (Worker)"
        OC[orator-conversion beacon]
        SHARP[Sharp / ffmpeg / pdftoppm]
        OC --- SHARP
    end

    RR -->|"triggerOperation('rr-image-thumbnail', params)"| UV
    UV -->|"Enqueue MediaConversion/ImageResize"| OC
    OC -->|"Upload result binary"| UV
    UV -->|"Stream binary response"| RR
```

## How It Connects

### 1. Startup

All three services start independently:

```bash
# Terminal 1: Ultravisor
ultravisor start -l

# Terminal 2: retold-remote
retold-remote serve ~/Media -u -l

# Terminal 3: orator-conversion
npm start -- -u -l
```

### 2. Registration

```mermaid
sequenceDiagram
    participant RR as retold-remote
    participant UV as Ultravisor
    participant OC as orator-conversion

    OC->>UV: POST /Beacon/Register<br/>{Name: "orator-conversion", Capabilities: ["MediaConversion"],<br/>ActionSchemas: [ImageResize, VideoThumbnail, ...],<br/>BindAddresses: [{IP: "127.0.0.1", Port: 8765}]}
    UV->>UV: Register beacon, auto-generate 14 task types
    UV->>UV: Probe reachability (no other beacons yet)
    UV-->>OC: {BeaconID: "bcn-orator-conversion-..."}

    RR->>UV: WebSocket: BeaconRegister<br/>{Name: "retold-remote", Contexts: {File: {BaseURL: "http://localhost:7827/content/"}},<br/>BindAddresses: [{IP: "127.0.0.1", Port: 7827}],<br/>Operations: [rr-image-thumbnail, rr-video-thumbnail, ...]}
    UV->>UV: Register beacon, store 9 operation definitions
    UV->>UV: Probe: retold-remote <-> orator-conversion = REACHABLE

    Note over UV: Both beacons registered.<br/>14 beacon task types available.<br/>9 operations from retold-remote.<br/>Reachability: all pairs reachable.
```

### 3. Auto-Generated Operations

retold-remote registers 9 operation definitions during beacon connection. These are complete operation graphs with nodes, connections, and state wiring -- built programmatically by `_buildPipelineOperation()`:

| Operation | Trigger Parameters | Pipeline |
|-----------|-------------------|----------|
| `rr-image-thumbnail` | ImageAddress, Width, Height, Format, Quality | resolve -> transfer -> resize -> send-result |
| `rr-video-thumbnail` | VideoAddress, Timestamp, Width | resolve -> transfer -> extract frame -> send-result |
| `rr-video-frame-extraction` | VideoAddress, Timestamp, Width | resolve -> transfer -> probe -> extract -> send-result |
| `rr-audio-waveform` | AudioAddress, SampleRate, Samples | resolve -> transfer -> waveform -> send-result |
| `rr-audio-segment` | AudioAddress, Start, Duration, Codec | resolve -> transfer -> extract -> send-result |
| `rr-pdf-page-render` | PdfAddress, Page, LongSidePixels | resolve -> transfer -> render -> send-result |
| `rr-image-convert` | ImageAddress, Format, Quality | resolve -> transfer -> convert -> send-result |
| `rr-ebook-convert` | EbookAddress | resolve -> transfer -> ebook-convert -> send-result |
| `rr-media-probe` | MediaAddress | resolve -> transfer -> ffprobe -> send-result |

Each pipeline follows the same pattern:

```mermaid
graph LR
    S[Start] --> R[resolve-address]
    R -->|URL, Filename| T[file-transfer]
    T -->|LocalPath| P[beacon-mediaconversion-*]
    P -->|OutputFile| SR[send-result]
    SR --> E[End]

    R -.->|Error| E
    T -.->|Error| E
    P -.->|Error| E
    SR -.->|Error| E
```

State connections wire outputs from earlier nodes into inputs of later nodes:
- `resolve.URL` -> `transfer.SourceURL`
- `resolve.Filename` -> `transfer.Filename`
- `transfer.LocalPath` -> `process.InputFile`

## End-to-End: Image Thumbnail Generation

When a user navigates to a folder in retold-remote, the browser requests thumbnails. Here's the complete flow:

```mermaid
sequenceDiagram
    participant Browser
    participant RR as retold-remote
    participant UV as Ultravisor
    participant OC as orator-conversion

    Browser->>RR: GET /content/preview/photo.jpg?w=400&h=300

    Note over RR: Check cache -> miss

    RR->>UV: POST /Operation/rr-image-thumbnail/Trigger<br/>{Parameters: {ImageAddress: ">retold-remote/File/photo.jpg",<br/>Width: 400, Height: 300, Format: "webp", Quality: 80}}

    Note over UV: Start operation (sync mode)

    UV->>UV: resolve-address<br/>>retold-remote/File/photo.jpg<br/>-> http://localhost:7827/content/photo.jpg

    UV->>RR: HTTP GET http://localhost:7827/content/photo.jpg
    RR-->>UV: 200 OK (image bytes)
    UV->>UV: file-transfer saves to staging<br/>/staging/rr-image-thumbnail-.../photo.jpg

    UV->>UV: beacon-mediaconversion-imageresize<br/>enqueue work item, WaitingForInput

    OC->>UV: POST /Beacon/Work/Poll
    UV-->>OC: WorkItem: {Action: "ImageResize",<br/>Settings: {InputFile: "/.../photo.jpg",<br/>OutputFile: "/.../thumbnail.jpg", Width: 400, ...}}

    OC->>OC: Sharp: resize photo.jpg -> thumbnail.jpg
    OC->>UV: POST /Beacon/Work/{hash}/Upload<br/>(raw binary: thumbnail.jpg)
    UV->>UV: Write to operation staging

    OC->>UV: POST /Beacon/Work/{hash}/Complete
    UV->>UV: resumeOperation -> send-result<br/>finds thumbnail.jpg in staging

    UV-->>RR: 200 OK<br/>Content-Type: application/octet-stream<br/>Body: (thumbnail bytes)

    RR->>RR: Cache the thumbnail
    RR-->>Browser: 200 OK (thumbnail image)
```

### Timing

On localhost, the full round-trip takes ~1-3 seconds:

| Step | Duration |
|------|----------|
| Address resolution | < 1ms |
| File transfer (50MB image) | ~200ms |
| Sharp resize | ~500ms |
| Binary upload | ~100ms |
| Total | ~1s |

### Fallback

If Ultravisor is unreachable or the operation fails, retold-remote falls through to local processing:

```javascript
this._dispatcher.triggerOperation('rr-image-thumbnail',
    { ImageAddress: '>retold-remote/File/' + tmpRelPath, Width, Height, Format, Quality },
    (pTriggerError, pResult) =>
    {
        if (!pTriggerError && pResult && pResult.OutputBuffer)
        {
            return fCallback(null, pResult.OutputBuffer);
        }
        // Fall through to local Sharp/ImageMagick
        this._generateImageThumbnailLocal(pFullPath, pWidth, pHeight, pFormat, fCallback);
    });
```

## Large File Support

orator-conversion handles arbitrarily large images (including 256MB+ scans):

- **File-path mode**: Sharp receives the file path directly instead of loading the entire file into a buffer
- **No pixel limit**: `sharp(filePath, { limitInputPixels: false })` -- disables Sharp's default pixel limit
- **Streaming**: File transfer uses Node.js streams, avoiding full-file buffering
- **Binary upload**: Result files transfer as raw bytes over HTTP or WebSocket -- no base64 encoding

## Error Handling

When a beacon reports a non-zero exit code (e.g., Sharp can't process a corrupt file), the beacon client reports it as an error. The operation graph's Error event fires, routing to the End node. The trigger returns a JSON response with `Success: false`, and retold-remote falls back to local processing.

```mermaid
flowchart TD
    A[Beacon processes work item] --> B{ExitCode == 0?}
    B -->|Yes| C[Upload output file]
    C --> D[Report completion]
    D --> E[Operation resumes -> send-result -> binary stream]
    B -->|No| F[Report error]
    F --> G[Operation resumes -> Error event -> End node]
    G --> H[Trigger returns JSON with Success: false]
    H --> I[retold-remote falls back to local processing]
```

## Logging

All three services support `-l` for file logging:

```bash
ultravisor start -l                    # ultravisor-2026-03-21T...log
retold-remote serve ~/Media -u -l      # retold-remote-2026-03-21T...log
npm start -- -u -l                     # orator-conversion-2026-03-21T...log
```

Key log prefixes for tracing the pipeline:
- `[TriggerOp]` -- retold-remote dispatcher
- `[Trigger]` -- Ultravisor trigger endpoint
- `[Engine]` -- Ultravisor execution engine
- `[Coordinator]` -- Beacon coordinator (work queue, uploads)
- `[OratorConversion]` -- orator-conversion provider
- `[Beacon]` -- Beacon client (execution, upload, completion)
