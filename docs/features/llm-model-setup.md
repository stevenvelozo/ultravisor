# LLM Model Setup Guide

This guide walks through setting up LLM Beacons for different providers.
Each section covers installation, configuration, and verification for a
specific backend.

You do not need machine learning expertise to set this up. Each LLM
provider has its own API that the Beacon wraps — you just need the
provider running and a configuration file pointing the Beacon at it.

## Prerequisites

- Node.js 18+ installed on the Beacon machine
- The Ultravisor source tree (or at minimum the `source/beacon/` directory)
- An Ultravisor server running and reachable from the Beacon machine

Start the Ultravisor server if it isn't already running:

```bash
cd ultravisor
node source/cli/Ultravisor-Run.cjs start
```

By default it listens on port 54321.

## General Setup Pattern

Every LLM Beacon follows the same three steps:

1. **Get the LLM API running** (install Ollama, get an API key, etc.)
2. **Create `.ultravisor-beacon.json`** in your working directory
3. **Start the Beacon** with `node source/beacon/Ultravisor-Beacon-CLI.cjs`

The Beacon registers with the Ultravisor server, advertises `LLM`
capability, and starts polling for work. It runs until you stop it
with Ctrl+C.

---

## Ollama (Local Models)

Ollama runs open-source models locally on your machine. No API keys, no
cloud services, no usage costs. Good for development, privacy-sensitive
workloads, or machines with GPUs.

### Step 1: Install Ollama

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download the installer from https://ollama.com/download

### Step 2: Start Ollama and pull a model

```bash
# Start the Ollama server (runs in background)
ollama serve

# Pull a model — this downloads the model weights (may take a few minutes)
ollama pull llama3.2

# Verify it works
ollama run llama3.2 "Say hello in one sentence"
```

Other popular models:

| Model               | Size   | Good for                          |
|---------------------|--------|-----------------------------------|
| `llama3.2`          | ~2 GB  | General purpose, fast             |
| `llama3.2:3b`       | ~2 GB  | Lighter, faster                   |
| `llama3.1:70b`      | ~40 GB | High quality, needs serious GPU   |
| `mistral`           | ~4 GB  | Good general purpose              |
| `codellama`         | ~4 GB  | Code generation and analysis      |
| `phi3`              | ~2 GB  | Microsoft's small but capable     |
| `nomic-embed-text`  | ~275 MB| Text embeddings                   |

For embeddings, pull a dedicated embedding model:

```bash
ollama pull nomic-embed-text
```

### Step 3: Create the Beacon config

Create `.ultravisor-beacon.json` in the directory where you'll run the
Beacon:

```json
{
    "ServerURL": "http://localhost:54321",
    "Name": "llm-ollama",
    "MaxConcurrent": 2,
    "Tags": {
        "LLM.Backend": "ollama",
        "LLM.Models": "llama3.2"
    },
    "Providers": [
        {
            "Source": "LLM",
            "Config": {
                "Backend": "ollama",
                "BaseURL": "http://localhost:11434",
                "Model": "llama3.2",
                "DefaultParameters": {
                    "Temperature": 0.7,
                    "MaxTokens": 4096
                }
            }
        }
    ]
}
```

If your Ultravisor server is on a different machine, change `ServerURL`
to its address (e.g., `"http://192.168.1.50:54321"`).

### Step 4: Start the Beacon

```bash
node source/beacon/Ultravisor-Beacon-CLI.cjs
```

You should see:

```
[Beacon CLI] Loaded config from /path/to/.ultravisor-beacon.json
[LLM] Provider initialized: backend=ollama, model=llama3.2
[LLM] Ollama server reachable at localhost:11434
[ProviderRegistry] Registered "LLM" → LLM [ChatCompletion, Embedding, ToolUse]
[Beacon] Loaded 1 capability provider(s).
[Beacon] Capabilities: LLM
[Beacon] Registered as bcn-llm-ollama-...
[Beacon CLI] Beacon is running. Polling every 5000ms.
```

### Troubleshooting

- **"Ollama server not reachable"** — Make sure `ollama serve` is running.
  Check with `curl http://localhost:11434/api/tags`.
- **Slow responses** — First request after pulling a model is slower
  (loading into memory). Subsequent requests are faster. On CPU-only
  machines, expect 5-30 seconds per response depending on model size.
- **Out of memory** — Use a smaller model. `llama3.2:3b` or `phi3` work
  well on machines with 8GB RAM. The 70B models need 48GB+ RAM or a GPU
  with equivalent VRAM.

---

## Anthropic (Claude)

Anthropic's Claude models are accessed through their cloud API. You need
an API key with billing set up.

### Step 1: Get an API key

1. Go to https://console.anthropic.com/
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new key
5. Copy the key — it starts with `sk-ant-`

### Step 2: Set the API key as an environment variable

The Beacon config supports `$ENV_VAR_NAME` syntax so you never put keys
in config files.

**bash/zsh:**
```bash
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

To make it permanent, add that line to `~/.bashrc`, `~/.zshrc`, or
`~/.profile`.

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-your-key-here"
```

### Step 3: Create the Beacon config

```json
{
    "ServerURL": "http://localhost:54321",
    "Name": "llm-claude",
    "MaxConcurrent": 3,
    "Tags": {
        "LLM.Backend": "anthropic",
        "LLM.Models": "claude-sonnet-4-20250514"
    },
    "Providers": [
        {
            "Source": "LLM",
            "Config": {
                "Backend": "anthropic",
                "BaseURL": "https://api.anthropic.com",
                "APIKey": "$ANTHROPIC_API_KEY",
                "Model": "claude-sonnet-4-20250514",
                "DefaultParameters": {
                    "Temperature": 0.7,
                    "MaxTokens": 4096
                },
                "TimeoutMs": 120000
            }
        }
    ]
}
```

Available Claude models:

| Model                            | Description                      |
|----------------------------------|----------------------------------|
| `claude-opus-4-20250514`         | Most capable, highest cost       |
| `claude-sonnet-4-20250514`       | Good balance of speed and quality|
| `claude-haiku-4-5-20251001`      | Fastest, lowest cost             |

### Step 4: Start the Beacon

```bash
node source/beacon/Ultravisor-Beacon-CLI.cjs
```

### Troubleshooting

- **"401 Unauthorized"** — Your API key is missing or invalid. Check
  `echo $ANTHROPIC_API_KEY` to verify it's set.
- **"429 Too Many Requests"** — You've hit rate limits. Anthropic has
  per-minute and per-day limits that vary by plan. Reduce `MaxConcurrent`
  or add delays between requests.
- **"400 max_tokens"** — Anthropic requires `max_tokens` on every
  request. The provider defaults to 4096 if not set, but some models
  support higher values.

---

## OpenAI (GPT-4, etc.)

### Step 1: Get an API key

1. Go to https://platform.openai.com/
2. Sign in and navigate to API Keys
3. Create a new secret key
4. Copy the key — it starts with `sk-`

### Step 2: Set the API key

```bash
export OPENAI_API_KEY="sk-your-key-here"
```

### Step 3: Create the Beacon config

```json
{
    "ServerURL": "http://localhost:54321",
    "Name": "llm-openai",
    "MaxConcurrent": 5,
    "Tags": {
        "LLM.Backend": "openai",
        "LLM.Models": "gpt-4o"
    },
    "Providers": [
        {
            "Source": "LLM",
            "Config": {
                "Backend": "openai",
                "BaseURL": "https://api.openai.com",
                "APIKey": "$OPENAI_API_KEY",
                "Model": "gpt-4o",
                "DefaultParameters": {
                    "Temperature": 0.7,
                    "MaxTokens": 4096
                }
            }
        }
    ]
}
```

Common OpenAI models:

| Model        | Description                            |
|--------------|----------------------------------------|
| `gpt-4o`     | Latest GPT-4, fast and capable        |
| `gpt-4o-mini`| Cheaper, good for simple tasks         |
| `o1`         | Reasoning model, slower but thorough   |

For embeddings, the model is separate. Set it per-request using the
`Model` setting on the embedding task:

| Embedding Model            | Dimensions | Notes               |
|----------------------------|------------|----------------------|
| `text-embedding-3-small`   | 1536       | Cheaper, good enough |
| `text-embedding-3-large`   | 3072       | Higher quality       |

### Step 4: Start the Beacon

```bash
node source/beacon/Ultravisor-Beacon-CLI.cjs
```

### Troubleshooting

- **"401" or "invalid_api_key"** — Check that `OPENAI_API_KEY` is set
  and has billing enabled. Free-tier keys have very limited access.
- **"model_not_found"** — Make sure you have access to the model. Some
  models require specific account tiers.

---

## OpenAI-Compatible APIs

Many providers offer APIs that follow the OpenAI format: Azure OpenAI,
Together AI, Groq, Anyscale, local servers like vLLM or text-generation-
inference, etc. Use the `openai-compatible` backend for these.

### Example: Groq

```json
{
    "ServerURL": "http://localhost:54321",
    "Name": "llm-groq",
    "MaxConcurrent": 3,
    "Tags": {
        "LLM.Backend": "groq",
        "LLM.Models": "llama-3.1-70b-versatile"
    },
    "Providers": [
        {
            "Source": "LLM",
            "Config": {
                "Backend": "openai-compatible",
                "BaseURL": "https://api.groq.com/openai",
                "APIKey": "$GROQ_API_KEY",
                "Model": "llama-3.1-70b-versatile"
            }
        }
    ]
}
```

### Example: Local vLLM server

```json
{
    "Providers": [
        {
            "Source": "LLM",
            "Config": {
                "Backend": "openai-compatible",
                "BaseURL": "http://localhost:8000",
                "Model": "meta-llama/Llama-3-8b-hf"
            }
        }
    ]
}
```

The key is that `BaseURL` should point to wherever the API serves its
`/v1/chat/completions` endpoint. The provider appends the path
automatically.

---

## Running Multiple LLMs

You can run multiple Beacons, each wrapping a different model or
provider. They all register independently with the same Ultravisor
server.

```
Machine A (GPU server)
  └── Beacon: ollama + llama3.1:70b
       ServerURL: http://ultravisor-host:54321

Machine B (your laptop)
  └── Beacon: ollama + llama3.2
       ServerURL: http://ultravisor-host:54321

Machine C (any machine with internet)
  └── Beacon: anthropic + claude-sonnet-4-20250514
       ServerURL: http://ultravisor-host:54321
```

Each Beacon advertises `Capability: "LLM"`. The coordinator sends work
to whichever Beacon is available. To target a specific Beacon, use
`AffinityKey` in your operation graph tasks.

### Multiple providers on one Beacon

A single Beacon can also load multiple providers. For example, Shell and
LLM together:

```json
{
    "Name": "multi-worker",
    "Providers": [
        { "Source": "Shell" },
        {
            "Source": "LLM",
            "Config": {
                "Backend": "ollama",
                "BaseURL": "http://localhost:11434",
                "Model": "llama3.2"
            }
        }
    ]
}
```

This Beacon advertises both `Shell` and `LLM` capabilities and can
handle work for either.

---

## Remote Beacons

The Beacon communicates with the Ultravisor server over HTTP. It does
**not** need to run on the same machine as the server. The only
requirement is network connectivity to the server's port (default 54321).

The Beacon needs these files from the Ultravisor source tree:

```
source/beacon/
  ├── Ultravisor-Beacon-CLI.cjs
  ├── Ultravisor-Beacon-Client.cjs
  ├── Ultravisor-Beacon-Executor.cjs
  ├── Ultravisor-Beacon-CapabilityProvider.cjs
  ├── Ultravisor-Beacon-ProviderRegistry.cjs
  └── providers/
      ├── Ultravisor-Beacon-Provider-Shell.cjs
      ├── Ultravisor-Beacon-Provider-FileSystem.cjs
      └── Ultravisor-Beacon-Provider-LLM.cjs
```

These files have zero npm dependencies — they use only Node.js built-in
modules. Copy the `source/beacon/` directory to your remote machine,
create a `.ultravisor-beacon.json` config file, and run:

```bash
node Ultravisor-Beacon-CLI.cjs
```

---

## Verifying Your Setup

Once the Beacon is running, you can verify it from the Ultravisor server.

### Check registered Beacons

```bash
curl http://localhost:54321/Beacons
```

You should see your LLM Beacon in the list with `Status: "Online"` and
`Capabilities: ["LLM"]`.

### Test with a simple operation

Load one of the example operations and execute it:

1. Copy `operation-library/llm-summarize.json` content
2. POST it to the Ultravisor API or load it via the web interface
3. Set `Operation.InputFilePath` to a text file you want summarized
4. Execute the operation

Or use the CLI:

```bash
node source/cli/Ultravisor-Run.cjs execute --operation llm-summarize
```

Watch the Beacon terminal — you should see it pick up the work item,
make the LLM API call, and report back.

---

## Configuration Reference

Full provider config options:

| Key                | Type   | Default        | Description                              |
|--------------------|--------|----------------|------------------------------------------|
| Backend            | string | `"openai"`     | `openai`, `anthropic`, `ollama`, or `openai-compatible` |
| BaseURL            | string | (required)     | API base URL                             |
| APIKey             | string | `""`           | API key or `$ENV_VAR_NAME`               |
| Model              | string | (required)     | Default model name                       |
| DefaultParameters  | object | `{}`           | Default `Temperature`, `MaxTokens`, `TopP` |
| TimeoutMs          | number | `120000`       | Per-request timeout in milliseconds      |

Per-request settings (set in the operation graph) override
`DefaultParameters`. The `Model` setting on a task overrides the
provider's default model.
