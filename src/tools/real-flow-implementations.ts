/**
 * Real implementations for flow analysis MCP tools
 * Direct database access - no service layers, no abstractions
 */

import { ModuleSentinelBridge } from '../rust-bridge/module-sentinel-bridge';
import { createLogger } from '../utils/logger';

const logger = createLogger('RealFlowImplementations');

/**
 * Real data flow analysis - replaces mock implementation
 */
export async function analyzeRealDataFlow(bridge: ModuleSentinelBridge, args: any) {
    const anomalyThreshold = args?.anomaly_threshold ?? 0.1;
    const targetFunction = args?.target_function;

    try {
        // Get actual relationships from Rust
        const relationships = await bridge.get_all_relationships();
        
        if (relationships.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: '⚠️ No relationships found. Run `index_project` first to populate the database with actual code analysis data.'
                }]
            };
        }

        // Analyze actual relationships for patterns
        const callRelationships = relationships.filter(r => r.relationshipType?.includes('call'));
        const dataFlowRelationships = relationships.filter(r => r.relationshipType?.includes('data_flow'));
        
        let result = `🔄 **Real Data Flow Analysis**\n\n`;
        result += `**Database Stats:**\n`;
        result += `- Total relationships: ${relationships.length}\n`;
        result += `- Call relationships: ${callRelationships.length}\n`;
        result += `- Data flow relationships: ${dataFlowRelationships.length}\n\n`;

        if (targetFunction) {
            // Search for the specific function in real symbols
            const symbols = await bridge.search_symbols(targetFunction, { limit: 10 });
            const targetSymbol = symbols.find(s => s.name === targetFunction);
            
            if (targetSymbol) {
                result += `📍 **Function Found:** \`${targetSymbol.name}\`\n`;
                result += `   Location: ${targetSymbol.filePath}:${targetSymbol.startLine}\n`;
                result += `   Signature: \`${targetSymbol.signature}\`\n\n`;

                // Find actual relationships for this symbol
                const symbolRelationships = await bridge.get_symbol_relationships(targetSymbol.id);
                result += `**Real Relationships for ${targetFunction}:**\n`;
                
                if (symbolRelationships.length === 0) {
                    result += `- No relationships found\n`;
                } else {
                    symbolRelationships.slice(0, 10).forEach(rel => {
                        result += `- ${rel.relationshipType}: confidence ${rel.confidence.toFixed(2)}\n`;
                    });
                }
                result += `\n`;
            } else {
                result += `❌ Function '${targetFunction}' not found in symbols\n\n`;
            }
        }

        // Detect actual anomalies in the relationships
        result += `## 🚨 Real Anomalies Detected\n\n`;
        
        // Group relationships by confidence
        const lowConfidenceRels = relationships.filter(r => r.confidence < anomalyThreshold);
        
        if (lowConfidenceRels.length > 0) {
            result += `**Low Confidence Relationships (< ${(anomalyThreshold * 100).toFixed(0)}%)**\n`;
            lowConfidenceRels.slice(0, 5).forEach((rel, i) => {
                result += `${i + 1}. ${rel.relationshipType} (confidence: ${(rel.confidence * 100).toFixed(1)}%)\n`;
                if ((rel as any).contextSnippet || (rel as any).contextSnippet) {
                    const snippet = (rel as any).contextSnippet || (rel as any).contextSnippet;
                    result += `   Context: \`${snippet.substring(0, 80)}...\`\n`;
                }
            });
            result += `\n`;
        } else {
            result += `✅ All relationships have high confidence (>= ${(anomalyThreshold * 100).toFixed(0)}%)\n\n`;
        }

        // Show actual data flow paths
        if (dataFlowRelationships.length > 0) {
            result += `## 📊 Real Data Flow Paths\n\n`;
            result += `Found ${dataFlowRelationships.length} data flow relationships:\n`;
            dataFlowRelationships.slice(0, 5).forEach((rel, i) => {
                result += `${i + 1}. ${rel.relationshipType} (${(rel.confidence * 100).toFixed(1)}% confidence)\n`;
                const metadata = (rel as any).metadata;
                if (metadata) {
                    try {
                        const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
                        result += `   File: ${parsedMetadata.file || 'unknown'}\n`;
                    } catch {
                        // Ignore parsing errors
                    }
                }
            });
        }

        return {
            content: [{
                type: 'text',
                text: result
            }]
        };
    } catch (error) {
        logger.error('Real data flow analysis failed', error);
        return {
            content: [{
                type: 'text',
                text: `❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
        };
    }
}

/**
 * Real critical path analysis - replaces mock implementation
 */
export async function findRealCriticalPaths(bridge: ModuleSentinelBridge, args: any) {
    const minCriticality = args?.min_criticality ?? 3.0;

    try {
        // Get all relationships to build the graph
        const relationships = await bridge.get_all_relationships();
        
        if (relationships.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: '⚠️ No relationships found. Run `index_project` first to analyze your codebase.'
                }]
            };
        }

        // Build fan-in/fan-out map
        const fanIn = new Map<string, number>();
        const fanOut = new Map<string, number>();
        const symbolInfo = new Map<string, any>();

        for (const rel of relationships) {
            const sourceId = rel.fromSymbolId?.toString();
            const targetId = rel.toSymbolId?.toString();

            if (sourceId) {
                fanOut.set(sourceId, (fanOut.get(sourceId) || 0) + 1);
                if (!symbolInfo.has(sourceId)) {
                    symbolInfo.set(sourceId, { 
                        id: sourceId, 
                        type: rel.relationshipType || 'unknown',
                        context: ((rel as any).contextSnippet || (rel as any).contextSnippet)?.substring(0, 50) || 'unknown'
                    });
                }
            }

            if (targetId) {
                fanIn.set(targetId, (fanIn.get(targetId) || 0) + 1);
                if (!symbolInfo.has(targetId)) {
                    symbolInfo.set(targetId, { 
                        id: targetId, 
                        type: rel.relationshipType || 'unknown',
                        context: ((rel as any).contextSnippet || (rel as any).contextSnippet)?.substring(0, 50) || 'unknown'
                    });
                }
            }
        }

        // Calculate criticality scores
        const criticalNodes = [];
        for (const [symbolId, info] of symbolInfo) {
            const fanInCount = fanIn.get(symbolId) || 0;
            const fanOutCount = fanOut.get(symbolId) || 0;
            
            // Simple criticality: fan_in * fan_out + (fan_in + fan_out) / 2
            const score = fanInCount * fanOutCount + (fanInCount + fanOutCount) / 2;
            
            if (score >= minCriticality) {
                criticalNodes.push({
                    symbolId,
                    fanIn: fanInCount,
                    fanOut: fanOutCount,
                    score,
                    info
                });
            }
        }

        // Sort by criticality score
        criticalNodes.sort((a, b) => b.score - a.score);

        let result = `🎯 **Real Critical Path Analysis**\n\n`;
        result += `**Analysis Results:**\n`;
        result += `- Total symbols analyzed: ${symbolInfo.size}\n`;
        result += `- Total relationships: ${relationships.length}\n`;
        result += `- Critical nodes found: ${criticalNodes.length}\n`;
        result += `- Minimum criticality threshold: ${minCriticality}\n\n`;

        if (criticalNodes.length === 0) {
            result += `✅ No critical paths found above threshold ${minCriticality}\n`;
            result += `Try lowering the threshold or ensure your project is properly indexed.\n`;
        } else {
            result += `## 🔥 Critical Nodes (Top ${Math.min(10, criticalNodes.length)})\n\n`;
            
            criticalNodes.slice(0, 10).forEach((node, i) => {
                result += `### ${i + 1}. Symbol ${node.symbolId}\n`;
                result += `- **Criticality Score:** ${node.score.toFixed(1)}\n`;
                result += `- **Fan-in:** ${node.fanIn} (incoming connections)\n`;
                result += `- **Fan-out:** ${node.fanOut} (outgoing connections)\n`;
                result += `- **Context:** \`${node.info.context}\`\n\n`;
            });

            result += `## 💡 Recommendations\n\n`;
            result += `1. **Review high fan-in nodes** - These may be bottlenecks\n`;
            result += `2. **Monitor high fan-out nodes** - These are dependency hubs\n`;
            result += `3. **Consider refactoring** - Nodes with both high fan-in and fan-out\n`;
        }

        return {
            content: [{
                type: 'text',
                text: result
            }]
        };
    } catch (error) {
        logger.error('Real critical path analysis failed', error);
        return {
            content: [{
                type: 'text',
                text: `❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
        };
    }
}

/**
 * Real data lineage tracing - replaces mock implementation
 */
export async function traceRealLineage(bridge: ModuleSentinelBridge, args: any) {
    const sourceName = args?.source_name;
    const maxDepth = args?.max_depth ?? 10;
    const showTransformations = args?.show_transformations ?? true;

    if (!sourceName) {
        return {
            content: [{
                type: 'text',
                text: '❌ Please provide a source_name to trace (e.g., "user_input", "request.body", "config_file")'
            }]
        };
    }

    try {
        // Search for symbols matching the source name
        const symbols = await bridge.search_symbols(sourceName, { limit: 10 });
        
        if (symbols.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: `❌ No symbols found matching '${sourceName}'. Try a different search term.`
                }]
            };
        }

        let result = `🔍 **Real Data Lineage Trace**\n\n`;
        result += `**Tracing:** \`${sourceName}\`\n`;
        result += `**Max Depth:** ${maxDepth}\n`;
        result += `**Found ${symbols.length} matching symbols**\n\n`;

        // For each matching symbol, get its relationships
        for (const symbol of symbols.slice(0, 3)) { // Limit to top 3 matches
            result += `## 📊 Lineage for: \`${symbol.name}\`\n`;
            result += `**Location:** ${symbol.filePath}:${symbol.startLine}\n`;
            result += `**Type:** ${symbol.signature}\n\n`;

            // Get relationships for this symbol
            const relationships = await bridge.get_symbol_relationships(symbol.id);
            
            if (relationships.length === 0) {
                result += `No relationships found for this symbol.\n\n`;
                continue;
            }

            result += `**Direct Relationships (${relationships.length} found):**\n`;
            relationships.slice(0, maxDepth).forEach((rel, i) => {
                result += `${i + 1}. **${rel.relationshipType}** (confidence: ${(rel.confidence * 100).toFixed(1)}%)\n`;
                
                const contextSnippet = (rel as any).contextSnippet || (rel as any).contextSnippet;
                if (contextSnippet && showTransformations) {
                    result += `   └─ Context: \`${contextSnippet.substring(0, 80)}...\`\n`;
                }
                
                const metadata = (rel as any).metadata;
                if (metadata) {
                    try {
                        const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
                        if (parsedMetadata.file) {
                            result += `   └─ File: ${parsedMetadata.file}\n`;
                        }
                    } catch {
                        // Ignore parsing errors
                    }
                }
            });
            
            result += `\n`;
        }

        // Summary
        const allRelationships = await bridge.get_all_relationships();
        const totalCallRelationships = allRelationships.filter(r => r.relationshipType?.includes('call')).length;
        const totalDataFlowRelationships = allRelationships.filter(r => r.relationshipType?.includes('data_flow')).length;

        result += `## 📈 Lineage Summary\n\n`;
        result += `- **Total call relationships in project:** ${totalCallRelationships}\n`;
        result += `- **Total data flow relationships in project:** ${totalDataFlowRelationships}\n`;
        result += `- **Analysis depth:** ${maxDepth} levels\n`;

        return {
            content: [{
                type: 'text',
                text: result
            }]
        };
    } catch (error) {
        logger.error('Real lineage tracing failed', error);
        return {
            content: [{
                type: 'text',
                text: `❌ Lineage tracing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
        };
    }
}

/**
 * Real deepest flows analysis - replaces mock implementation
 */
export async function findRealDeepestFlows(bridge: ModuleSentinelBridge, args: any) {
    const limit = args?.limit ?? 5;
    const minDepth = args?.min_depth ?? 3;

    try {
        // Get all relationships to analyze flow depth
        const relationships = await bridge.get_all_relationships();
        
        if (relationships.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: '⚠️ No relationships found. Run `index_project` first to analyze your codebase.'
                }]
            };
        }

        // Build graph and find flow chains
        const graph = new Map<string, string[]>();
        const relationship_types = new Map<string, string>();

        for (const rel of relationships) {
            const sourceId = rel.fromSymbolId?.toString();
            const targetId = rel.toSymbolId?.toString();

            if (sourceId && targetId) {
                if (!graph.has(sourceId)) {
                    graph.set(sourceId, []);
                }
                graph.get(sourceId)!.push(targetId);
                relationship_types.set(`${sourceId}-${targetId}`, rel.relationshipType || 'unknown');
            }
        }

        // Find deep flow paths using DFS
        const deepPaths = [];
        const visited = new Set<string>();

        for (const [startNode] of graph) {
            if (!visited.has(startNode)) {
                const paths = findPathsFromNode(startNode, graph, minDepth, visited);
                deepPaths.push(...paths);
            }
        }

        // Sort by depth and take top flows
        deepPaths.sort((a, b) => b.length - a.length);
        const topFlows = deepPaths.slice(0, limit);

        let result = `🌊 **Real Deepest Data Flows**\n\n`;
        result += `**Analysis Results:**\n`;
        result += `- Total symbols in graph: ${graph.size}\n`;
        result += `- Total relationships: ${relationships.length}\n`;
        result += `- Deep flows found (>= ${minDepth} depth): ${deepPaths.length}\n`;
        result += `- Showing top: ${topFlows.length}\n\n`;

        if (topFlows.length === 0) {
            result += `✅ No deep flows found with minimum depth ${minDepth}\n`;
            result += `Try lowering the minimum depth threshold.\n`;
        } else {
            result += `## 🏔️ Deepest Flows Found\n\n`;

            topFlows.forEach((path, i) => {
                result += `### ${i + 1}. Flow Chain (Depth: ${path.length})\n`;
                result += `**Path:** ${path.slice(0, 5).join(' → ')}`;
                if (path.length > 5) {
                    result += ` → ... (${path.length - 5} more)`;
                }
                result += `\n`;
                
                // Show relationship types for first few hops
                result += `**Relationship Types:**\n`;
                for (let j = 0; j < Math.min(3, path.length - 1); j++) {
                    const relType = relationship_types.get(`${path[j]}-${path[j + 1]}`) || 'unknown';
                    result += `  ${j + 1}. ${path[j]} --[${relType}]--> ${path[j + 1]}\n`;
                }
                
                result += `\n`;
            });

            result += `## 💡 Analysis Insights\n\n`;
            result += `1. **Deep flow chains indicate complex dependencies**\n`;
            result += `2. **Consider breaking long chains for maintainability**\n`;
            result += `3. **Review critical paths in your longest flows**\n`;
        }

        return {
            content: [{
                type: 'text',
                text: result
            }]
        };
    } catch (error) {
        logger.error('Real deepest flows analysis failed', error);
        return {
            content: [{
                type: 'text',
                text: `❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
        };
    }
}

// Helper function to find paths from a node using DFS
function findPathsFromNode(
    startNode: string, 
    graph: Map<string, string[]>, 
    minDepth: number,
    globalVisited: Set<string>
): string[][] {
    const paths: string[][] = [];
    const currentPath = [startNode];
    const localVisited = new Set<string>();
    
    function dfs(node: string, path: string[]) {
        if (localVisited.has(node)) {
            return; // Avoid cycles in current path
        }
        
        localVisited.add(node);
        globalVisited.add(node);
        
        const neighbors = graph.get(node) || [];
        
        if (neighbors.length === 0) {
            // Leaf node - save path if deep enough
            if (path.length >= minDepth) {
                paths.push([...path]);
            }
        } else {
            for (const neighbor of neighbors) {
                dfs(neighbor, [...path, neighbor]);
            }
        }
        
        localVisited.delete(node);
    }
    
    dfs(startNode, currentPath);
    return paths;
}