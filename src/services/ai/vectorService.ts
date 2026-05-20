import { getAiClient } from "./client";
import { dbService, VectorData } from "../db/indexedDB";
import { ChatMessage, AppSettings } from "../../types";

// Task 3.2: Vector Service Implementation

export const vectorService = {
    /**
     * Calculates Cosine Similarity between two vectors
     */
    cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    },

    /**
     * Generates embedding for a given text using free models with rotation/fallback
     */
    async getEmbedding(text: string, settings?: AppSettings): Promise<number[] | null> {
        if (!text || text.trim().length === 0) return null;

        // Bỏ qua tạo vector nếu không có API key cá nhân, để tránh lỗi 403/404 trên AI Studio preview
        const hasPersonalKey = settings?.geminiApiKey && settings.geminiApiKey.length > 0 && settings.geminiApiKey.some(k => k && k.trim() !== "" && k !== "YOUR_API_KEY");
        const hasProxy = settings?.proxies && settings.proxies.some(p => p.id === settings.activeProxyId && p.key);
        const hasLegacyProxy = settings?.proxyEnabled && settings.proxyUrl && settings.proxyKey;

        // Try to generate vector in all cases. Let the fetch/client handle API keys.
        // if (!hasPersonalKey && !hasProxy && !hasLegacyProxy) {
        //     console.warn("Bỏ qua tạo vector (embedding)...");
        //     return null;
        // }

        const userModel = settings?.embeddingModel;
        const fallbackModels = ['gemini-embedding-001', 'text-embedding-005', 'text-multilingual-embedding-002', 'gemini-embedding-2', 'text-embedding-004'];
        
        const models = userModel 
            ? [userModel, ...fallbackModels.filter(m => m !== userModel)] 
            : fallbackModels;
        
        for (const modelName of models) {
            try {
                // ALLOW PROXY: Don't force direct, so users behind proxies can still use embeddings
                const aiClient = getAiClient(settings, false);
                
                const result = await aiClient.models.embedContent({
                    model: modelName,
                    contents: [
                        {
                            parts: [{ text: text }]
                        }
                    ]
                });

                const embedding = result.embeddings?.[0];
                if (embedding?.values) {
                    return embedding.values;
                }
            } catch (error: unknown) {
                console.error("Embedding generation failed for model", modelName, error);
                // Silent fallback: Try next model in list without alerting the user
                continue; 
            }
        }

        // All models failed, but we keep it silent as requested
        return null;
    },

    /**
     * Saves a message (user or model) to Vector DB
     */
    async saveVector(id: string, text: string, role: 'user' | 'model', settings?: AppSettings): Promise<void> {
        // Avoid re-saving if exists
        const exists = await dbService.hasVector(id);
        if (exists) return;

        const embedding = await this.getEmbedding(text, settings);
        if (embedding) {
            const vectorData: VectorData = {
                id,
                text,
                embedding,
                timestamp: Date.now(),
                role
            };
            await dbService.saveVector(vectorData);
        }
    },

    /**
     * Saves a novel chunk to Vector DB
     */
    async saveNovelChunkVector(chunkId: string, docId: string, text: string, settings?: AppSettings): Promise<void> {
        const exists = await dbService.hasVector(chunkId);
        if (exists) return;

        const embedding = await this.getEmbedding(text, settings);
        if (embedding) {
            const vectorData: VectorData = {
                id: chunkId,
                text,
                embedding,
                timestamp: Date.now(),
                role: 'novel_source',
                docId
            };
            await dbService.saveVector(vectorData);
        }
    },

    /**
     * Searches for semantically similar text from the vector database, optionally filtered by role
     */
    async searchSimilarVectors(queryText: string, settings?: AppSettings, limit: number = 10, roleFilter?: 'user' | 'model' | 'novel_source'): Promise<VectorData[]> {
        const queryEmbedding = await this.getEmbedding(queryText, settings);
        if (!queryEmbedding) return [];

        let allVectors = await dbService.getAllVectors();
        if (roleFilter) {
            allVectors = allVectors.filter(v => v.role === roleFilter);
        }
        
        // Calculate similarity for each vector
        const scoredVectors = allVectors.map(vec => ({
            ...vec,
            score: this.cosineSimilarity(queryEmbedding, vec.embedding)
        }));

        // Sort by score descending and take top 'limit'
        return scoredVectors
            .filter(v => v.score > 0.35) 
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    },

    /**
     * Task 3.4: Process old history and vectorize missing messages
     */
    async vectorizeAllHistory(history: ChatMessage[], settings?: AppSettings): Promise<void> {
        for (let i = 0; i < history.length; i++) {
            const msg = history[i];
            const msgId = `msg-${msg.timestamp}-${msg.role}`;
            
            const exists = await dbService.hasVector(msgId);
            if (!exists && msg.text) {
                await new Promise(r => setTimeout(r, 200)); 
                await this.saveVector(msgId, msg.text, msg.role, settings);
            }
        }
    }
};
