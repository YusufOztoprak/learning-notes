---
type: topic
block: AI Backend
topic: Vector search performance (pgvector)
period: 2026-10-30 – 2026-11-05
written: 2026-11-05
sources:
  - "pgvector README — Indexing (HNSW, IVFFlat)"
  - "evorag commits: feat(db): add HNSW index on chunk embeddings; docs: document vector index decision and measurements"
project: evorag
tags: [pgvector, hnsw, ivfflat, query-planner, toast, postgres, evorag]
---

# Vector search performance (pgvector)

> Topic note, written after the work was done — not a weekly notebook note.
> All numbers are my own measurements on 50,000 **random** 1536-dimensional vectors (local Docker, PostgreSQL 17 + pgvector).

## Key concepts

### 1. Exact vs. approximate search

**Exact search** compares the query with **every row**. It always finds the true nearest neighbours, but its cost grows linearly with the table.

**Approximate (ANN) search** uses an index to skip most rows. HNSW and IVFFlat are two different ways of doing this. The price is **recall**:

> **Recall** = the fraction of the true top-k neighbours that the index actually returns. If the index finds 9 of the true top 10, recall is 0.9.

Without an index, pgvector does exact search: a `Seq Scan`, then a top-N sort.

| | Time |
|---|---|
| Exact search, 50k vectors (psql) | 295–411 ms |
| Same query with an HNSW index (warm cache) | ~2.5 ms |

### 2. HNSW vs. IVFFlat

- **HNSW** builds a multi-layer **graph**. A query starts at the top layer and walks towards closer and closer nodes (roughly O(log n)).
- **IVFFlat** splits the vectors into **clusters** (`lists`). A query finds the nearest cluster centre(s) and scans only those clusters (`probes`, default 1).

What I measured:

| | HNSW | IVFFlat (`lists = 50`, `probes = 1`) |
|---|---|---|
| Build time (1 GB `maintenance_work_mem`) | 98 s | **2.9 s** |
| Index size | 391 MB | 391 MB |
| Query (warm) | 2.35 ms | 2.55 ms |
| Recall | higher | lower (looks at one cluster only) |
| Created on an empty table | fine | builds, but recall collapses |

**Rule of thumb for `lists`:** `rows / 1000` up to 1M rows, `sqrt(rows)` above that. 50,010 rows → 50 lists.

**The important difference is not speed.** Query time and size were almost the same. The difference is *when the structure is decided*:

- IVFFlat computes its cluster centres **once, at build time**, from the data that exists at that moment. New vectors are assigned to these fixed centres. On an empty or small table the centres are meaningless, and as the data changes the clusters get unbalanced → recall drops silently. Fix: periodic `REINDEX`.
- HNSW adds each new vector to the graph **incrementally**.

**Ask yourself:** In evorag, the index is created by an Alembic migration. How many rows does the table have when the migration runs?

> **Answer:** Zero. `alembic upgrade head` creates the table and the index right after it. Documents arrive later, one at a time through `POST /documents`. So IVFFlat would build its clusters from nothing and never update them. HNSW's slow build (98 s) only matters for a bulk build; adding one document at a time is cheap. → **evorag uses HNSW.**

IVFFlat would be the better choice when data is bulk-loaded, rarely changes, and the index has to be rebuilt often.

### 3. Why the planner ignored my index

After creating the HNSW index, `EXPLAIN ANALYZE` still showed `Seq Scan`. The index existed and was usable (`SET LOCAL enable_seqscan = off` made the planner use it), but the planner **chose** not to.

The planner picks the plan with the lowest **estimated cost**. I recomputed its estimate by hand:

| Part | Calculation | Cost |
|---|---|---|
| Read pages | 5,344 kB / 8 kB = 668 pages × 1.0 | 668 |
| Process rows | 50,010 × 0.01 | 500 |
| Compute `<=>` per row | 50,010 × 0.0025 | 125 |
| **Seq Scan total** | | **1,293** ✔ (matches `EXPLAIN`) |

Two wrong assumptions:

1. **Page count.** Each vector is ~6 KB, so Postgres stored it out of line in **TOAST**. The main table was only 5 MB, while the real data was ~400 MB. The planner looked at the 5 MB.
2. **Operator cost.** A 1536-dimensional cosine distance is costed like comparing two integers (0.0025).

Result: Seq Scan + Sort ≈ 2,124 vs. index ≈ 2,560 → the planner chose the Seq Scan, which actually took ~300 ms.

**Fix:** keep vectors in the main table.

```sql
ALTER TABLE chunks ALTER COLUMN embedding SET STORAGE PLAIN;
```

`PLAIN` does not give the planner a rule. It changes **where the data lives**: a 6 KB vector fits in one 8 KB page, so the main table grew from 5 MB to **391 MB**. With the real size visible, the Seq Scan estimate became realistic and the planner picked the index **on its own** (2.35 ms, no forcing).

⚠️ `SET STORAGE` only affects rows written **after** the change. Existing rows stay in TOAST until they are rewritten.

**Lesson:** an index existing is not an index being used. Always check the plan with `EXPLAIN`.

### 4. Why memory matters — twice

**Build time.** HNSW builds its graph in `maintenance_work_mem` (default 64 MB).

```
9,758 vectors × 1536 dims × 4 bytes ≈ 60 MB ≈ the 64 MB limit
```

After that the graph spilled to disk (`NOTICE: hnsw graph no longer fits into maintenance_work_mem`). The build had not finished after **15 minutes**. With `SET maintenance_work_mem = '1GB'` it took **98 s**.

**Query time.** HNSW jumps between random graph nodes, so the index has to be in memory. The 391 MB index did not fit in the default 128 MB `shared_buffers`:

| | Index scan time |
|---|---|
| First query (cold cache) | ~244 ms |
| Next queries (warm) | ~2.5 ms |

### 5. Index size at 1536 dimensions

Both indexes were **391 MB**, the same as the table itself. Every index entry stores a full copy of the vector (~6 KB), so each entry fills most of an 8 KB page: 50,000 pages × 8 KB = 391 MB. At this dimension, the vector itself dominates storage; graph links or cluster info are tiny in comparison.

## How I applied it in evorag

- Measured the problem through evorag's own logs first: `request.completed` latency minus `embedding.created` latency ≈ database time. Before: **~280 ms**. After: **~52 ms** per search request (of which the search itself is ~2.5 ms; the rest is evorag's own overhead).
- Migration `0e2631f8d708`: `SET STORAGE PLAIN` + HNSW index with `vector_cosine_ops`. Tested **upgrade → downgrade → upgrade**.
- Declared the same index in the SQLAlchemy model (`__table_args__`), so `alembic revision --autogenerate` will not try to drop it.
- Documented the decision and numbers in evorag's README ("Design decisions").

**Mistakes I made along the way (and what they taught me):**
- My first `downgrade()` contained `DROP TABLE chunks`. A downgrade must only undo **its own** migration.
- I created IVFFlat by hand in psql and forgot to drop it → **schema drift**: my database no longer matched the migrations.
- A broken `import Index` line passed all 24 tests, because no test imports `pgvector_store.py`. `uv run python -c "import evorag.main"` caught it. Green tests ≠ the app starts.

## Useful psql tools I learned

| Command | What it does |
|---|---|
| `\d chunks` | Table + its indexes |
| `\timing on` | Show each command's duration |
| `EXPLAIN ANALYZE` | Run the query and show the real plan with timings |
| `SELECT ... \gset` | Store a query result in a psql variable |
| `:'var'` | Insert that variable as a quoted literal |
| `\o file` / `\o` | Send output to a file / back to the screen |
| `\! cmd` | Run a shell command from psql |
| `\pset pager off` | Stop psql from opening `less` |
| `BEGIN; SET LOCAL ...; COMMIT;` | Change a setting only for one transaction |

`\` commands are psql-only: run each one on its own line, never pasted together with SQL.

## Still unclear

- **Recall was not measured.** Random vectors are the worst case for ANN recall; it should be measured on real embeddings (planned with Ragas).
- How `hnsw.ef_search` and IVFFlat `probes` move the speed/recall trade-off in practice.
- `PLAIN` works because 1536 floats (~6 KB) fit in one 8 KB page. What happens with 3072-dimensional embeddings (~12 KB)?
- The first search request after rebuilding the index was slow (231 ms vs ~52 ms). Probably cached query preparation being refreshed; not verified.
- evorag sends the query vector as a parameter. Does the planner behave differently once Postgres switches a prepared statement to a generic plan?

## Blog potential

- **"My index existed, but Postgres ignored it"** — the TOAST / cost-estimate story, with the hand-computed planner cost. Strongest candidate.
- HNSW vs. IVFFlat: why build time didn't matter, but an empty table did.
