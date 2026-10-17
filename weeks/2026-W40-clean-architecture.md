---
week: 1
dates: 2026-09-28 – 2026-10-04
block: Backend Core
topic: Clean Architecture
sources:
  - "Uncle Bob — A Little Architecture (blog.cleancoder.com)"
  - "Uncle Bob — The Clean Architecture (2012)"
  - "Uncle Bob — Screaming Architecture (2011)"
project: evorag
tags: [clean-architecture, dependency-rule, dip, evorag]
---

# Week 1 — Clean Architecture

## 1. Dependency Inversion: "Calling something without mentioning it"
*(from "A Little Architecture")*

**Two kinds of dependency**
- **Runtime:** Sender calls Receiver → Sender ➜ Receiver
- **Compile time (source code):** Sender never mentions Receiver's name. The opposite: Receiver imports Sender → Receiver ➜ Sender

Goal: high-level code (business rules) must **not mention** the source code of low-level code (DB, frameworks).

**What makes it possible: polymorphism.** The sender does not know the receiver's concrete type, only an interface ("something that can handle this message"). So it can run the concrete class's code without ever writing its name.

**Rule: the caller owns the interface.** The `Receiver` interface lives in the `sender` package. To implement it, `SpecificReceiver` has to import `sender`. That is how the arrow flips.

```
sender package                   receiver package
┌──────────────────┐            ┌──────────────────┐
│ Sender           │            │ SpecificReceiver │
│ Receiver (iface) │ ◄───────── │ implements it    │
└──────────────────┘   import   └──────────────────┘
   runtime call: Sender ─────────► SpecificReceiver
```

**Nested classes are not required.** What matters is *which side* the interface lives on.

> "Compile time" in Python = the import lines: which files this file depends on by name.

**Ask yourself:** If the interface lived next to the OpenAI code, where would the use case's import line point?

> **Answer:** It would point to the outer layer (`adapters/openai_embeddings.py`). The use case would depend on the OpenAI adapter at compile time, so the arrow would point outward and break the Dependency Rule. At runtime nothing changes; only the source-code dependency is wrong.

---

## 2. The Clean Architecture (2012)

**Big idea.** Hexagonal, Onion, BCE, DCI and Screaming Architecture are all the same idea: **separation of concerns** through layers.

**Independence from:** frameworks (tools, not a home), UI, database, external agencies ➜ **testable** without UI, DB or web server.

**The Dependency Rule.** Source code dependencies point **inward only**. Inner circles must not mention any name from outer circles, and must not use outer data formats.

| Circle | Contains | Changes when… | In evorag |
|---|---|---|---|
| **Entities** | Enterprise business rules | almost never | `domain/chunk.py` |
| **Use Cases** | Application business rules | app behavior changes | `IngestDocument`, `SearchChunks` |
| **Interface Adapters** | Controllers, presenters, gateways | DB/API format changes | `adapters/http/`, `pgvector_store.py`, `openai_embeddings.py` |
| **Frameworks & Drivers** | DB, web framework, devices | the tool changes | PostgreSQL, FastAPI, OpenAI API |

- Inner = **policy**; outer = **mechanism**.
- Four circles is not a rule. The Dependency Rule is.
- All SQL lives in the adapter layer.

**Crossing boundaries.** Flow of control: Controller ➜ Use Case ➜ Presenter. Source code dependencies all point inward. How? DIP: the use case calls an **Output Port** (interface in the inner circle) that the presenter implements.

**What crosses a boundary?** Only simple data structures (DTOs). Never entities, never DB rows. Data crosses in the form most convenient for the inner circle.

**Ask yourself:** `IngestDocument` returns `IngestResult` instead of calling a presenter. Does that break the Dependency Rule?

> **Answer:** No, it does not break the rule. `IngestResult` is defined in the use-case layer (inner circle). The use case only returns its own DTO and never mentions anything from an outer circle. The HTTP route (outer circle) imports `IngestResult`, so the dependency points inward. An Output Port is only needed when the use case has to *call* something outside; here, control simply returns to the caller.

---

## 3. Screaming Architecture (2011)

1. **Big idea.** A blueprint screams what a building is *for*. Top-level folders should scream **what the system does**, not which framework it uses.
2. **Architecture = structure that supports use cases** (Ivar Jacobson, use case driven approach).
3. **Defer tool decisions.** Framework, DB and web server can be decided and changed later.
4. **The web is a delivery mechanism, not an architecture.** Console app, web app or web service — same core.
5. **Frameworks are tools, not ways of life.** Be skeptical: what does it cost, how do I protect my use cases from it?
6. **Testable architecture.** Use cases can be unit-tested without a web server or database.
7. **Test for a good structure.** A new developer understands the system's use cases before seeing how it's delivered.

**Ask yourself:** A typical Express project has `controllers/`, `services/`, `models/`, `routes/` at the top level. What does that structure scream?

> **Answer:** It screams "this is an Express MVC web app", not what the system does. If business logic lives inside controllers and depends on `req`/`res`, changing the delivery mechanism (a CLI, a message queue, GraphQL) means rewriting a lot of code. I would group the top level by domain concepts, e.g. `products/`, `orders/`, `stock/` for an inventory system, so even a beginner understands what the project is about. Each folder holds its use cases, and the framework code stays in adapters. Then I can test every use case with fake adapters, without a database or web server.

> Note to self: it's fake **adapters**, not fake use cases — the use cases are the real thing under test.

---

## How I applied it in evorag

- **Ports owned by the inner side:** `EmbeddingProvider` (`shared/ports.py`), `ChunkWriter`, `ChunkSearcher` are `typing.Protocol`s defined next to the use cases.
- **Composition root:** `main.py` is the only module that knows every concrete class.
- **Screaming structure:** `ingestion/`, `retrieval/` at the top; FastAPI only in `adapters/http/`.
- **Boundary data:** pgvector's numpy array → `list[float]` in the adapter; `SearchChunks` returns `SearchHit` DTOs, not `Chunk` entities.
- **Tests with fakes:** `FakeEmbeddingProvider` + `InMemoryChunkStore`; suite runs without Docker or an API key.
- **Observability without breaking the rule:** token counting via a request-scoped `ContextVar` holder, so ports and use cases stayed unchanged.

## Still unclear

- 

## Blog potential

- ✅ Written: "Counting OpenAI Tokens per Request in FastAPI — Without Touching My Use Cases" (Building evorag series)
- Possible next: recalibrating the similarity threshold (0.75 → 0.2) with real scores
