# Download Hub Client

A **completely standalone** CLI tool that connects to a Download Hub server, registers as a task sender, submits download tasks, and specifies target storage servers. Runs independently — no dependency on the main server project.

## Architecture

```
┌─────────────────────┐     gRPC      ┌─────────────────┐     gRPC      ┌─────────────────┐
│  Task Client        │──────────────▶│  Download Hub    │──────────────▶│  Storage Server  │
│  (this tool)        │  Register     │  (this project)  │  PushFile     │  (separate inst) │
│                     │  + Submit     │                  │               │                  │
│  npm start -- --hub │  Download     │  - Downloads     │               │  Receives files  │
│  localhost:50051    │◀──────────────│  - Routes files  │               │  + persists      │
└─────────────────────┘  Progress     └─────────────────┘               └─────────────────┘
                                    stream
```

## Quick Start

```bash
cd client
npm install

# Interactive mode
npm start -- --hub localhost:50051 --name "MyClient"

# One-shot mode
npm start -- \
  --hub 192.168.1.10:50051 \
  --name "Downloader-01" \
  --url "https://example.com/file.zip" \
  --storage "storage-1"
```

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--hub` | Hub server address | `localhost:50051` |
| `--name` | Client device name | `cli-{hostname}` |
| `--url` | Target URL to download | empty (interactive) |
| `--storage` | Target storage server ID | empty (Hub local) |

## How It Works

1. **Connect** — Pings Hub to verify connectivity
2. **Register** — Registers as a task client (sends device name, OS, hostname)
3. **List Storage** — Queries Hub for registered storage servers
4. **Submit** — Sends a download task to Hub
5. **Progress** — Receives real-time progress stream (progress bar, speed, size)
6. **Complete** — Hub pushes the file to the target storage server
7. **Heartbeat** — Client sends keepalive every 25 seconds (stays online in Hub's device list)

## Requirements

- Node.js 18+
- A running Download Hub server on the network
- (Optional) Storage server instances running on network
