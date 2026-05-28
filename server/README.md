# Download Hub Storage Server

A **standalone** gRPC server that receives pushed files from the Download Hub and stores them in a local KV database. Registers with the Hub and sends heartbeats to stay discoverable by Task Clients.

## Architecture

```
Task Client ──SubmitDownload──► Hub ──PushFile──► Storage Server (this)
                                                      │
                                                      ▼
                                                  KV Database
                                              (file-based index)
```

## Quick Start

```bash
cd server
npm install

# Start with Hub registration
npm start -- --hub localhost:50051 --name "NAS-01" --port 50052
```

## Web API

The storage server also provides a REST API on `{grpc_port + 1}`:

| Endpoint | Method | Description |
|---|---|---|
| `/api/files` | GET | List all stored files |
| `/api/files/:id` | GET | Get file metadata |
| `/api/download/:id` | GET | Download file content |
| `/api/stats` | GET | Database stats |

## KV Database

Each file is stored as:
- `data/{file_id}.file` — raw file content
- `data/index.json` — in-memory index with metadata, checksum, timestamps

## Requirements

- Node.js 18+
- A running Download Hub on the network
