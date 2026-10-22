// Product
class Prompt {
    system = "";
    context: string[] = [];
    question = "";
    maxTokens = 256;

    toString(): string {
        return `[system] ${this.system}\n[context] ${this.context.join(" | ")}\n[question] ${this.question}\n[maxTokens] ${this.maxTokens}`;
    }
}

//Builder
class PromptBuilder {
    private prompt = new Prompt();

    withSystem(text: string): this {
        this.prompt.system = text;
        return this;
    }

    withContext(chunks: string[]): this {
        this.prompt.context = chunks;
        return this;
    }
    withQuestion(q: string): this {
        this.prompt.question = q;
        return this;
    }

    withMaxTokens(n: number): this {
        this.prompt.maxTokens = n;
        return this;
    }

    build(): Prompt {
        if (!this.prompt.question) {
            throw new Error("question is required");
        }
        const result = this.prompt;
        this.prompt = new Prompt();
        return result;
    }
}

// Client
const p1 = new PromptBuilder()
    .withSystem("You are a biomedical research assistant.")
    .withContext(["Aspirin reduces inflammation.", "It inhibits COX enzymes."])
    .withQuestion("How does aspirin work?")
    .build();

const p2 = new PromptBuilder()
    .withQuestion("What is RAG?")
    .build();

console.log(p1.toString());
console.log("---");
console.log(p2.toString());

try {
    new PromptBuilder().withSystem("no question here").build();
} catch (err) {
    console.log("caught:", (err as Error).message);
}