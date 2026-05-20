import { getAiClient } from "../client";
import { AppSettings, ChatMessage, WorldData } from "../../../types";
import { dbService } from "../../db/indexedDB";
import { v4 as uuidv4 } from "uuid";

export interface GraphNode {
    id: string;
    label: string; // e.g., "Person", "Location", "Item", "Event"
    name: string;
    description: string;
    properties: Record<string, string>;
}

export interface GraphEdge {
    id: string;
    source: string; // Node ID
    target: string; // Node ID
    relationship: string;
    description: string;
    weight: number;
}

export const GraphRAGService = {
    // Helper to get save-specific keys for tavo_data
    getNodesKey(saveId: string): string {
        return `graphRAG_${saveId}_nodes`;
    },
    getEdgesKey(saveId: string): string {
        return `graphRAG_${saveId}_edges`;
    },

    async getAllNodes(saveId: string): Promise<GraphNode[]> {
        const nodes = await dbService.getTavoData(this.getNodesKey(saveId));
        return (nodes || []) as GraphNode[];
    },

    async getAllEdges(saveId: string): Promise<GraphEdge[]> {
        const edges = await dbService.getTavoData(this.getEdgesKey(saveId));
        return (edges || []) as GraphEdge[];
    },

    async saveGraphData(saveId: string, nodes: GraphNode[], edges: GraphEdge[]): Promise<void> {
        await dbService.setTavoData(this.getNodesKey(saveId), nodes);
        await dbService.setTavoData(this.getEdgesKey(saveId), edges);
    },

    /**
     * Extracts Entities and Relationships from a given chat text using the LLM.
     * Updates the Graph in IndexedDb.
     */
    async extractAndIntegrate(
        recentHistory: ChatMessage[],
        saveId: string,
        settings: AppSettings
    ): Promise<void> {
        if (!recentHistory || recentHistory.length === 0) return;
        
        const historyText = recentHistory
            .map(m => `[${m.role}]: ${m.text}`)
            .join("\n\n");

        const prompt = `Bạn là một hệ thống trích xuất thông tin (Information Extraction).
Hãy trích xuất các Thực thể (Nodes) và Mối quan hệ (Edges) từ đoạn hội thoại sau.
Chỉ trích xuất các thông tin QUAN TRỌNG, mang tính cốt truyện.
Format trả về phải là một JSON object với 2 key: "nodes" và "edges".

- "nodes": mảng các đối tượng chứa "name" (tên thực thể), "label" (loại thực thể VD: Person, Location, Item, Event, Faction), "description" (mô tả ngắn).
- "edges": mảng các đối tượng chứa "source" (tên thực thể nguồn), "target" (tên thực thể đích), "relationship" (mối quan hệ VD: "is friends with", "located in", "owns", "enemy_of"), "description" (mô tả tính chất mối quan hệ).

Đoạn hội thoại:
${historyText}`;

        const aiClient = getAiClient(settings);
        
        try {
            const response = await aiClient.models.generateContent({
                model: settings.aiModel,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.1,
                    responseMimeType: "application/json",
                }
            });

            const text = response.text || "{}";
            const cleanText = text.replace(/```json\n?|```/g, "").trim();
            const parsed = JSON.parse(cleanText);

            if (!parsed.nodes && !parsed.edges) return;

            const existingNodes = await this.getAllNodes(saveId);
            const existingEdges = await this.getAllEdges(saveId);

            const newNodesParsed: any[] = parsed.nodes || [];
            const newEdgesParsed: any[] = parsed.edges || [];

            // Integrate Nodes
            for (const n of newNodesParsed) {
                if (!n.name) continue;
                const existing = existingNodes.find(en => en.name.toLowerCase() === n.name.toLowerCase());
                if (existing) {
                    // Update descriptions if not included already
                    if (!existing.description.includes(n.description)) {
                        existing.description += "; " + n.description;
                    }
                } else {
                    existingNodes.push({
                        id: uuidv4(),
                        name: n.name,
                        label: n.label || "Entity",
                        description: n.description || "",
                        properties: {}
                    });
                }
            }

            // Integrate Edges
            for (const e of newEdgesParsed) {
                if (!e.source || !e.target) continue;
                // Find node UUIDs
                const sourceNode = existingNodes.find(n => n.name.toLowerCase() === e.source.toLowerCase());
                const targetNode = existingNodes.find(n => n.name.toLowerCase() === e.target.toLowerCase());
                
                if (sourceNode && targetNode) {
                    const existingEdge = existingEdges.find(
                        x => x.source === sourceNode.id && x.target === targetNode.id
                    );
                    if (existingEdge) {
                        existingEdge.relationship = e.relationship || existingEdge.relationship;
                        existingEdge.description = e.description || existingEdge.description;
                        existingEdge.weight += 1;
                    } else {
                        existingEdges.push({
                            id: uuidv4(),
                            source: sourceNode.id,
                            target: targetNode.id,
                            relationship: e.relationship || "related_to",
                            description: e.description || "",
                            weight: 1.0
                        });
                    }
                }
            }

            await this.saveGraphData(saveId, existingNodes, existingEdges);
            console.log(`[GraphRAG] Integrated ${newNodesParsed.length} nodes and ${newEdgesParsed.length} edges.`);
        } catch (e) {
            console.error("[GraphRAG] Extraction failed:", e);
        }
    },

    /**
     * Retrieves Graph context based on the current user input via Named Entity Recognition (NER).
     */
    async retrieveContext(userMessage: string, history: ChatMessage[], saveId: string, settings: AppSettings): Promise<string> {
        const allNodes = await this.getAllNodes(saveId);
        const allEdges = await this.getAllEdges(saveId);

        if (allNodes.length === 0) return "";

        // Simple Keyword-based NER fallback (since hitting LLM here every time would be slow).
        // Alternatively we can use LLM to extract entities from userMessage.
        const recentWords = userMessage.split(/\W+/);
        const matchedNodes = allNodes.filter(n => 
            userMessage.toLowerCase().includes(n.name.toLowerCase()) ||
            history.slice(-2).some(h => h.text.toLowerCase().includes(n.name.toLowerCase()))
        );

        if (matchedNodes.length === 0) return "";

        // Build a minimal sub-graph centered around matched Nodes (1-hop)
        const relevantNodeIds = new Set(matchedNodes.map(n => n.id));
        const relevantEdges = allEdges.filter(e => relevantNodeIds.has(e.source) || relevantNodeIds.has(e.target));
        
        // Include target nodes from these edges
        relevantEdges.forEach(e => {
            relevantNodeIds.add(e.source);
            relevantNodeIds.add(e.target);
        });

        const finalNodes = allNodes.filter(n => relevantNodeIds.has(n.id));

        let contextString = "### Bối cảnh Mạng Kiến Thức (Knowledge Graph):\n";
        
        // Print Nodes info
        contextString += "- Thực thể:\n";
        for (const n of finalNodes) {
            contextString += `  - [${n.label}] ${n.name}: ${n.description}\n`;
        }

        // Print Edges Info
        contextString += "- Mối quan hệ:\n";
        for (const e of relevantEdges) {
            const sName = allNodes.find(n => n.id === e.source)?.name || "Unknown";
            const tName = allNodes.find(n => n.id === e.target)?.name || "Unknown";
            contextString += `  - ${sName} --(${e.relationship})--> ${tName}: ${e.description}\n`;
        }

        return contextString;
    }
};
