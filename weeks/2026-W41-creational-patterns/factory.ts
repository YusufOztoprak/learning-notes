// 1. Product
interface EmbeddingProvider {
    embed(texts: string[]): number[][];
}

// 2. Concrete Products
class FakeEmbeddingProvider implements EmbeddingProvider {
    embed(texts: string[]): number[][] {
        return texts.map(() => [0.1, 0.2, 0.3]);
    }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
    embed(texts: string[]): number[][] {
        console.log("calling openAIEmbeddingProvider");
        return texts.map(() => [0.1, 0.2, 0.3]);
    }
}

class LocalEmbeddingProvider implements EmbeddingProvider {
    embed(texts: string[]): number[][] {
        console.log("running local model");
        return texts.map(() => [0.9, 0.8, 0.7]);
    }
}

// 3. Creator
abstract class IngestionPipeline {
    abstract createEmbedder(): EmbeddingProvider;

    ingest(doc: string): void {
        const chunks = doc.split(". ");
        const embedder = this.createEmbedder();
        const vectors = embedder.embed(chunks);
        console.log(vectors);
    }
}

// 4. Concrete Creators
class FakeIngestion extends IngestionPipeline {
    createEmbedder(): EmbeddingProvider {
        return new FakeEmbeddingProvider();
    }
}

class OpenAIIngestion extends IngestionPipeline {
    createEmbedder(): EmbeddingProvider {
        return new OpenAIEmbeddingProvider();
    }
}

class LocalIngestion extends IngestionPipeline {
    createEmbedder(): EmbeddingProvider {
        return new LocalEmbeddingProvider();
    }
}

//5. Client
function run(pipeline: IngestionPipeline) {
    pipeline.ingest("RAG is useful. Embeddings are vectors. Factories decouple code.");
}

run(new FakeIngestion());
run(new OpenAIIngestion());
run(new LocalIngestion());

