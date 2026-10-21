class AppConfig {
    private static instance: AppConfig;

    readonly embeddingModel = "text-embedding-3-small";
    readonly similarityThreshold = 0.75;

    private constructor() {
        console.log("config loaded");
    }

    static getInstance(): AppConfig {
        if (!AppConfig.instance) {
            AppConfig.instance = new AppConfig();
        }
        return AppConfig.instance;
    }
}

const a = AppConfig.getInstance();
const b = AppConfig.getInstance();

console.log(a === b);
console.log(a.embeddingModel);

// const c = new AppConfig(); // compile error in TS, but runs with plain node (private is compile-time only)

