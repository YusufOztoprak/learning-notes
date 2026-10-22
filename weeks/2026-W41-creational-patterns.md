# W41 — Creational Patterns: Interview Summary

**Source:** [refactoring.guru/design-patterns/creational-patterns](https://refactoring.guru/design-patterns/creational-patterns)
**Code:** [`2026-W41-creational-patterns/`](./2026-W41-creational-patterns/) — `factory.ts`, `singleton.ts`, `builder.ts`

## Overview

| Pattern | Problem it solves | One-line solution | My example |
|---|---|---|---|
| **Factory Method** | Business logic coupled to concrete classes; adding a type means editing existing code | Subclasses override a factory method to decide which class to create | `IngestionPipeline.createEmbedder()` → `EmbeddingProvider` |
| **Singleton** | A resource must have exactly one instance with global access (config, DB pool) | Private constructor + static `getInstance()` with lazy init | `AppConfig.getInstance()` |
| **Builder** | Objects with many optional parts → telescoping constructors | Separate builder with one method per step; call only what you need, then `build()` | `PromptBuilder` (fluent, validates on `build()`) |

---

## Factory Method

**Problem:** Business logic is coupled to concrete classes (`new Truck()` everywhere). Adding a new type means changing existing code in many places.

**Solution:** Replace direct `new` calls with a factory method. Subclasses override it to decide which class gets created.

**Structure:**
1. Product: common interface (`Transport`)
2. Concrete Products: implementations (`Truck`, `Ship`)
3. Creator: business logic + declares the factory method
4. Concrete Creators: override the factory method

**Key points:**
- The creator's main job is NOT creating objects. Its business logic *uses* the product; the factory method decouples that logic from concrete classes.
- The factory method's return type is the interface, never the concrete class.
- Without the pattern: supporting a new type means editing the business logic itself (if/else) or duplicating it.

**Pros:** loose coupling, Single Responsibility, Open/Closed (new product = new subclass)
**Con:** many extra subclasses → more complexity

**Simple Factory vs Factory Method:**
- Simple Factory: one function with a `switch`, no inheritance
- Factory Method: inheritance, the subclass decides
- Backend practice: simple factory + DI is more common (NestJS `useFactory`)

---

## Singleton

**Problem:** Some resources must have exactly one instance (DB pool, config, logger) and need global access. Global variables can be overwritten by any code.

**Solution:**
1. Make the constructor private → no `new` from outside
2. Static `getInstance()` → creates the instance on first call (lazy initialization), returns the cached one after that

**Why not a normal constructor?** A constructor always returns a NEW object by design.

**Pros:** guaranteed single instance, global access point, lazy initialization

**Cons:**
- Violates SRP: solves two problems at once (single instance + global access)
- Hard to unit test: private constructor and static methods can't be mocked
- Hidden global state; can mask bad design (components know too much about each other)
- Multithreading: needs a lock + double-checked `if` (not needed in Node, it's single-threaded)

**In backend practice:** don't hand-write it, let the DI container manage it. NestJS providers are singletons by default and can be replaced with mocks in tests.

**TS gotcha:** `private` is compile-time only. Running with plain `node` (types stripped), `new AppConfig()` still works and creates a second instance. The editor/`tsc` is what enforces it. (`#private` fields are enforced at runtime.)

---

## Builder

**Problem:** Complex objects with many optional parts → "telescoping constructor" (`new House(4, 2, true, false, null, ...)`) or a subclass for every combination.

**Solution:** Move construction into a separate builder with one method per step. Call only the steps you need, then get the result.

**Structure:**
- Builder interface: the construction steps
- Concrete Builders: implement the steps, hold the product, `getProduct()` (then `reset()`)
- Product: the result; products from different builders don't need a common interface
- Director (optional): stores reusable step sequences ("recipes")

**Builder vs Factory:** Factory returns the product immediately; Builder lets you configure it step by step before getting it.

**Pros:** step-by-step construction, same construction code for different representations, SRP (construction separated from business logic)
**Con:** more classes → more complexity

**In practice:** fluent builder (methods return `this`, chain calls), e.g. TypeORM `createQueryBuilder()`. In TS/Python, a simple options object is often enough instead of a builder.

---

## When NOT to use

- **Factory Method:** only one product type, or a simple factory function + DI is enough
- **Singleton:** when you need testability; prefer the DI container
- **Builder:** few parameters; an options object (`new X({ ... })`) is often enough

## Likely interview questions

- **Simple Factory vs Factory Method?** Simple Factory = one function with a `switch`, no inheritance. Factory Method = inheritance, the subclass decides.
- **Factory vs Builder?** Factory returns the product immediately; Builder configures it step by step before returning it.
- **Why is Singleton called an anti-pattern?** Violates SRP, hidden global state, hard to mock in tests, needs locking in multithreaded code.
- **Where have you seen Builder?** Query builders: TypeORM `createQueryBuilder()`, Knex.
- **How does Factory Method relate to SOLID?** Open/Closed: I added `LocalEmbeddingProvider` without touching `ingest()`.

## What I learned by running the code

- Calling a method from inside itself → infinite recursion → `Maximum call stack size exceeded`
- TS `private` is compile-time only: `new AppConfig()` still ran with plain `node` and created a second instance
- A typo on a property returns `undefined` silently in plain JS; watch editor warnings
- `throw` signals the error where it's detected; `try/catch` handles it where it's called