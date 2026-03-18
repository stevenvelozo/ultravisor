# LLM Embedding

Generates vector embeddings for text input using an LLM provider. Dispatches the work to a Beacon with LLM capability.

## Settings

- **Text** — The text to embed. Supports Pict template expressions.
- **Model** — Override the default embedding model.
- **Dimensions** — Requested embedding dimensions (model-dependent).
- **InputAddress** — State address to read text from (alternative to Text setting).
- **Destination** — State address to write the embedding vector to.
- **AffinityKey** — Route to a specific Beacon worker.
- **TimeoutMs** — Timeout in milliseconds (default `60000`).

## Outputs

- **Embedding** — JSON array of floating-point numbers representing the embedding vector.
- **Dimensions** — Number of dimensions in the embedding.
- **Model** — Model used for embedding.
- **BeaconID** — ID of the Beacon that executed the work.

## Tips

Use embeddings for semantic search, clustering, or similarity comparisons. Store embeddings in a database via **Meadow Create** for later retrieval. Combine with **Expression Solver** or downstream processing to compute cosine similarity between vectors.
