export class GeminiKeyRotator {
    private keys: string[] = [];
    private currentKeyIndex = 0;
    private requestCounts: Map<string, number> = new Map();
    private readonly MAX_REQUESTS_PER_KEY = 10;

    constructor(primaryKey: string, additionalKeys: string[] = []) {
        // Primary key is always first
        this.keys = [primaryKey, ...additionalKeys].filter(Boolean);
        this.resetRequestCounts();
    }

    private resetRequestCounts() {
        this.requestCounts.clear();
        this.keys.forEach(key => this.requestCounts.set(key, 0));
    }

    getCurrentKey(): string {
        if (this.keys.length === 0) {
            throw new Error("No API keys available");
        }
        return this.keys[this.currentKeyIndex];
    }

    rotateKey(): string {
        if (this.keys.length === 0) {
            throw new Error("No API keys available");
        }

        // Reset count for current key if it's maxed out
        const currentKey = this.getCurrentKey();
        const currentCount = this.requestCounts.get(currentKey) || 0;
        if (currentCount >= this.MAX_REQUESTS_PER_KEY) {
            this.requestCounts.set(currentKey, 0);
        }

        // Find next key with available requests
        let checkedKeys = 0;
        while (checkedKeys < this.keys.length) {
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
            const nextKey = this.keys[this.currentKeyIndex];
            const count = this.requestCounts.get(nextKey) || 0;
            
            if (count < this.MAX_REQUESTS_PER_KEY) {
                return nextKey;
            }
            
            checkedKeys++;
        }

        // If all keys are maxed out, reset counts and start over
        this.resetRequestCounts();
        this.currentKeyIndex = 0;
        return this.getCurrentKey();
    }

    incrementRequestCount(): void {
        const currentKey = this.getCurrentKey();
        const currentCount = this.requestCounts.get(currentKey) || 0;
        this.requestCounts.set(currentKey, currentCount + 1);

        // Automatically rotate if current key hits limit
        if (currentCount + 1 >= this.MAX_REQUESTS_PER_KEY) {
            this.rotateKey();
        }
    }

    updateKeys(primaryKey: string, additionalKeys: string[] = []): void {
        this.keys = [primaryKey, ...additionalKeys].filter(Boolean);
        this.currentKeyIndex = 0;
        this.resetRequestCounts();
    }
}
