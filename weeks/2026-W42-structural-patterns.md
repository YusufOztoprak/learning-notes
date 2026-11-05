---
week: 2026-W42
dates: 12–18 Oct 2026 (done 27 Oct – 4 Nov)
block: Backend Core — Design Patterns: Structural
topic: Adapter, Decorator, Facade
sources:
  - https://refactoring.guru/design-patterns/structural-patterns
project: https://github.com/YusufOztoprak/rag-service
tags: [design-patterns, structural, adapter, decorator, facade, nestjs, typescript, rag]
---

# Week 3 — Structural Patterns: Adapter, Decorator, Facade

## Overview

| Pattern | Problem it solves | One-line solution | My example (rag-service) |
|---|---|---|---|
| **Adapter** | A useful 3rd-party/legacy class has an interface (or data format) my code can't use | A wrapper that implements *my* interface and translates calls/data to the service | `PubMedAdapter`: PubMed E-utilities (two-step search, XML) → `LiteratureSource` / `Article` |
| **Decorator** | Optional behaviours via inheritance → a subclass per combination | A wrapper with the *same* interface that delegates and adds behaviour before/after; stackable | `CachingEmbeddingProvider` wraps any `EmbeddingProvider`, composed in the factory |
| **Facade** | Business logic has to drive many subsystem objects in the right order | A class with a simple, limited interface that delegates to the subsystem | `IngestionService.ingestFromPubMed()`; `SearchService.ask()` already was one |

All three are built on **composition**: one object holds a reference to another and delegates work to it.

---

## Key concepts

### Adapter (a.k.a. Wrapper)

**Problem:** A useful class (3rd-party, legacy) has an interface incompatible with my code, and I can't or shouldn't change it.

**Solution:** A middle-layer class that implements my interface, wraps the service object, and translates each call/data into the format the service expects.

**Structure:**
- Client: my business logic
- Client Interface: what the client expects
- Service (Adaptee): the incompatible class
- Adapter: implements the client interface, wraps the service, delegates + converts

**Key points:**
- The adapter only converts interfaces/data. No business logic.
- Recognizable by a constructor that takes an object of a *different* type.
- TS has no multiple inheritance → only object adapter (composition).
- Taking the adaptee via the constructor makes testing easier (inject a fake).

**Pros:** SRP (conversion separate from business logic), Open/Closed (new adapters without changing the client)
**Con:** more classes; if you own the service, just change it

### Decorator (a.k.a. Wrapper)

**Problem:** Adding optional behaviours with inheritance → a subclass for every combination (combinatorial explosion). Inheritance is static and allows only one parent.

**Solution:** Wrap the object in another object that implements the *same* interface, delegates every call, and adds behaviour before or after. Wrappers can be stacked.

**Structure:**
- Component: common interface
- Concrete Component: the object being wrapped
- Base Decorator: holds a `wrappee` typed as the interface (so decorators can wrap decorators)
- Concrete Decorators: add behaviour before/after delegating
- Client: composes the stack at runtime (e.g. from config)

**Key points:**
- Recognizable by a constructor that takes an object of the *same* interface.
- Order matters: `Logging(Caching(x))` logs every call, `Caching(Logging(x))` logs only cache misses.
- With a single decorator, a base decorator class is optional.
- Not the same as TS `@Decorator` syntax (`@Injectable()`), which is a language feature for metadata.
- A caching wrapper sits on the line between Decorator and Proxy: Proxy manages the wrapped object's lifecycle itself, a decorator stack is composed by the client.

**Pros:** extend behaviour without subclasses, add/remove at runtime, combine behaviours, SRP
**Cons:** hard to remove one layer, behaviour can depend on order, setup code can get ugly

### Facade

**Problem:** Business logic has to initialize and coordinate many objects of a complex subsystem in the right order → tightly coupled to its details.

**Solution:** A class with a simple, limited interface that exposes only what the client needs and delegates to the subsystem.

**Structure:**
1. Facade: simple entry point, knows how to drive the subsystem
2. Additional Facade: split unrelated features out to avoid one huge facade
3. Complex Subsystem: unaware of the facade; its classes still talk to each other directly
4. Client: uses the facade instead of the subsystem

**Key points:**
- Trade-off: less functionality, much more simplicity.
- Not a lock: the subsystem can still be used directly.
- Moves unwanted dependencies to one place → swapping a library means rewriting only the facade.

**Pro:** isolates client code from subsystem complexity
**Con:** can become a god object coupled to everything

### How they differ

| | Interface | Wraps | Purpose |
|---|---|---|---|
| Adapter | different from the wrapped object | one object | make an existing interface usable |
| Decorator | same as the wrapped object | one object, stackable | add behaviour |
| Proxy | same as the wrapped object | one object | control access / lifecycle |
| Facade | new, simplified | a whole subsystem | hide complexity |

---

## How I applied it in my project

**Adapter — [`src/literature/pubmed.adapter.ts`](https://github.com/YusufOztoprak/rag-service/blob/main/src/literature/pubmed.adapter.ts)**
- `LiteratureSource.search(query, limit): Promise<Article[]>` is the client interface.
- Inside, PubMed's two-step API (`esearch` for IDs, `efetch` for XML) stays private.
- XML is parsed with `fast-xml-parser`; labelled abstract sections (BACKGROUND / METHODS / ...) are joined, articles without an abstract are skipped.
- Tests use saved fixtures and a mocked `fetch`, so they run offline and don't change when PubMed publishes new papers.
- I realised `OpenAIEmbeddingProvider` from last week was already an adapter around the OpenAI SDK.

**Decorator — [`src/embeddings/caching-embedding.provider.ts`](https://github.com/YusufOztoprak/rag-service/blob/main/src/embeddings/caching-embedding.provider.ts)**
- Implements `EmbeddingProvider`, takes any `EmbeddingProvider` in its constructor, returns cached vectors for repeated texts.
- Composed in the factory (`useFactory` in `embedding.module.ts`): `new CachingEmbeddingProvider(base)`. The services didn't change at all.
- `get model()` delegates to the wrapped provider: a decorator forwards everything that isn't its own job.
- Known limits: in-memory (lost on restart), unbounded, one instance shared via Nest's singleton scope.

**Facade — [`src/ingestion/ingestion.service.ts`](https://github.com/YusufOztoprak/rag-service/blob/main/src/ingestion/ingestion.service.ts)**
- `POST /ingestion/pubmed?q=...&limit=...` → `ingestFromPubMed()` searches PubMed through the adapter and passes each article to `DocumentService.ingest` (chunking, cached embedding, storage).
- It doesn't re-implement chunking or embedding, so it stays small instead of becoming a god object.
- The business decision "skip `Correction:` notices" lives here, not in the adapter.
- `limit` is capped at 20 to bound embedding cost; a missing `q` returns 400 (`BadRequestException`) instead of 500.

**Follow-up from a dev.to comment — [`migrations/003_embedding_model.sql`](https://github.com/YusufOztoprak/rag-service/blob/main/migrations/003_embedding_model.sql)**
- Every chunk now stores `embedding_model`, and search filters on the current provider's model, so fake and real vectors can't pollute each other's results.
- `EmbeddingProvider` got a `readonly model` field; the default was dropped after the backfill so a missing model fails loudly.
- Local development now uses the Docker Postgres instead of the production Neon database.

**End to end:**
```
POST /ingestion/pubmed → IngestionService (Facade)
  → PubMedAdapter (Adapter) → DocumentService → chunkText
  → CachingEmbeddingProvider (Decorator) → OpenAIEmbeddingProvider → chunks + embedding_model
GET /query/ask → SearchService (Facade) → PromptBuilder (Builder) → LLMService
```
Asking "Does low-dose aspirin prevent functional decline in older adults?" answered from an ingested PubMed abstract; an unrelated question correctly returned "I don't know."

## What I learned by running the code

- **Types are compile-time promises.** `ArticleTitle: string` was a lie at runtime: `<i>in vivo</i>` made the parser return an object. External data is only as typed as you validate it. Fixed by stripping inline tags before parsing; `htmlEntities: true` decodes `&#xb1;` → `±`.
- **`any[]` switches type safety off.** Passing `this.embedder` instead of `this.embedder.model` to `pool.query` compiled fine; `pg` tried to `JSON.stringify` the provider and failed on the OpenAI client's circular structure. In fake mode it "worked" and silently stored a JSON blob as the label.
- **Look at the first error in a chain.** The "Connection terminated unexpectedly" errors were a side effect of the circular-JSON failure leaving the pg client broken, not Neon or the network.
- **Test both modes.** Testing only with the fake provider would have hidden the bug above.
- **`fast-xml-parser` returns an object for one element and an array for many**; `isArray` fixes the shape.
- **Interfaces describe behaviour, contain no code**: no `function`, no `async`, no body.
- **`map` returns a value per element; `join` runs once at the end.**
- **`let`/`const` are block-scoped**: a variable declared inside `else { }` doesn't exist after it.
- **Getters can't be `async`.** **`:` declares a type, `=` assigns a value.**
- **`throw` where the problem is detected, `try/catch` where it's handled** (third week in a row).
- **Live API results change**: the same PubMed query returned different articles a week later. Fixture-based tests stayed green.
- PowerShell: `<` redirection isn't supported (use `Get-Content file | cmd`); use `curl.exe`, not `curl`.

## Likely interview questions

- **Adapter vs Facade?** Adapter makes one existing interface usable; Facade defines a new simple interface for a whole subsystem.
- **Adapter vs Decorator?** Adapter changes the interface; Decorator keeps it and adds behaviour, and decorators can be stacked.
- **Decorator vs Proxy?** Same structure; a proxy manages its service's lifecycle itself, a decorator stack is composed by the client. A cache can be described as either.
- **Where did you use an Adapter?** Wrapping the PubMed API: two-step search + XML → my `Article` type, with offline fixture tests.
- **Why does decorator order matter?** `Logging(Caching(x))` vs `Caching(Logging(x))` measure different things.
- **When does a Facade become a problem?** When it turns into a god object; split it into additional facades.

## Still unclear

- How to scale the cache: LRU limit vs Redis, and how to invalidate it if the model changes.
- HNSW + `WHERE` filter can return fewer rows than `LIMIT`; when does that matter at real data sizes?
- Chunking cuts mid-word (character-based). Sentence-aware chunking is probably better for retrieval quality.
- The public ingestion endpoint costs money per call; needs an API key or rate limit.

## Blog potential

- "Wrapping PubMed with the Adapter pattern: what the XML taught me about TypeScript types" (`<i>in vivo</i>`, `isArray`, fixture tests)
- "A dev.to comment changed my schema": storing `embedding_model` per chunk and why fake and real vectors must never mix
- "Look at the first error": how a circular-JSON bug masqueraded as a database connection problem
