/**
 * Relationship enrichment strategies we could implement
 * based on existing symbol data
 */

import type _Parser from "tree-sitter";
import { Database as _Database } from "better-sqlite3";
import { drizzle as _drizzle } from "drizzle-orm/better-sqlite3";
import { eq as _eq, and as _and, or as _or, inArray as _inArray, sql as _sql, isNull as _isNull } from "drizzle-orm";

// Import schema
import {
  universalSymbols as _universalSymbols,
  universalRelationships as _universalRelationships,
  detectedPatterns as _detectedPatterns,
  projectLanguages as _projectLanguages,
} from "../database/drizzle/schema.js";

export interface EnrichmentStrategy {
  name: string;
  description: string;
  requiredData: string[];
  produces: string[];
}

export const relationshipEnrichmentStrategies: EnrichmentStrategy[] = [
  {
    name: "ResolveSymbolReferences",
    description:
      "Match unresolved to_symbol_id using qualified names and signatures",
    requiredData: ["qualified_name", "signature", "file_path"],
    produces: ["resolved to_symbol_id links", "cross-module dependencies"],
  },
  {
    name: "ExtractTemplateRelationships",
    description:
      "Find template instantiation relationships from template_params",
    requiredData: ["template_params", "signature"],
    produces: ["instantiates", "specializes", "template dependency graph"],
  },
  {
    name: "InferDataFlow",
    description:
      "Track data transformations through return types and parameters",
    requiredData: ["signature", "return_type", "pipeline_stage"],
    produces: ["transforms_data", "data flow paths", "pipeline transitions"],
  },
  {
    name: "DiscoverVirtualOverrides",
    description: "Find virtual function override relationships",
    requiredData: ["is_virtual", "base_type", "qualified_name"],
    produces: ["overrides", "implements", "polymorphic call sites"],
  },
  {
    name: "BuildCallChains",
    description: "Construct execution paths from existing call relationships",
    requiredData: ["calls relationships", "pipeline_stage", "execution_mode"],
    produces: ["call_chains", "execution_paths", "critical paths"],
  },
  {
    name: "IdentifyGPUDispatches",
    description: "Find GPU compute dispatch points and data transfers",
    requiredData: ["uses_gpu_compute", "execution_mode", "signature"],
    produces: ["dispatches_to_gpu", "gpu_data_transfer", "compute kernels"],
  },
  {
    name: "ExtractFactoryPatterns",
    description: "Enhance factory relationships with product types",
    requiredData: [
      "factory_product relationships",
      "return_type",
      "template_params",
    ],
    produces: ["creates_instance", "factory registry", "product hierarchies"],
  },
  {
    name: "MapNamespaceHierarchy",
    description: "Build namespace containment and dependency graph",
    requiredData: ["namespace", "qualified_name"],
    produces: [
      "namespace_contains",
      "namespace_depends_on",
      "module boundaries",
    ],
  },
  {
    name: "TrackMemoryPatterns",
    description: "Identify memory allocation and ownership patterns",
    requiredData: ["signature", "return_type", "semantic_tags"],
    produces: ["allocates", "owns", "shares", "memory lifecycle"],
  },
  {
    name: "InferComponentDependencies",
    description: "Discover architectural component relationships",
    requiredData: ["pipeline_stage", "file_path", "namespace"],
    produces: [
      "component_depends_on",
      "layer_violations",
      "architectural flow",
    ],
  },
];

/**
 * Example implementation for resolving symbol references using DrizzleDatabase
 */
export async function resolveSymbolReferences(drizzleDb: any): Promise<number> {
  // First, create an index of all symbols by qualified name
  const symbolIndex = new Map<string, number>();

  const symbols = await drizzleDb.getSymbolsForIndexing();

  symbols.forEach((sym: any) => {
    if (sym.qualifiedName) {
      symbolIndex.set(sym.qualifiedName, sym.id);
    }
    // Also index by simple name for fallback
    if (!symbolIndex.has(sym.name)) {
      symbolIndex.set(sym.name, sym.id);
    }
  });

  // Update relationships with resolved IDs
  const unresolvedRels = await drizzleDb.getUnresolvedRelationships();

  let resolved = 0;

  for (const rel of unresolvedRels) {
    const toId = symbolIndex.get(rel.toName);
    if (toId) {
      await drizzleDb.updateRelationshipToSymbolId(rel.id, toId);
      resolved++;
    }
  }

  return resolved;
}

/**
 * Build execution call chains from resolved relationships using DrizzleDatabase
 */
export async function buildCallChains(drizzleDb: any): Promise<void> {
  // Find entry points (functions not called by others)
  const entryPoints = await drizzleDb.findFunctionEntryPoints();

  // For each entry point, trace call chains
  for (const entry of entryPoints) {
    const chain = await traceCallChain(drizzleDb, entry.id, 10);
    if (chain.length > 1) {
      const chainId = await drizzleDb.insertCallChain(entry.id, chain.length, chain.length);

      for (let index = 0; index < chain.length; index++) {
        const step = chain[index];
        await drizzleDb.insertCallChainStep(chainId, index, step.symbolId, step.callerId || null);
      }
    }
  }
}

async function traceCallChain(drizzleDb: any, startId: number, maxDepth: number): Promise<any[]> {
  const chain: any[] = [];
  const visited = new Set<number>();

  async function trace(symbolId: number, depth: number, callerId: number | null): Promise<void> {
    if (visited.has(symbolId) || depth > maxDepth) return;

    visited.add(symbolId);
    chain.push({ symbolId, callerId, depth });

    // Get all functions this symbol calls
    const calls = await drizzleDb.getFunctionsCalled(symbolId);

    for (const call of calls) {
      await trace(call.toSymbolId, depth + 1, symbolId);
    }
  }

  await trace(startId, 0, null);
  return chain;
}

/**
 * Extract GPU dispatch relationships using DrizzleDatabase
 */
export async function extractGPUDispatches(drizzleDb: any): Promise<void> {
  // Find GPU compute functions
  const gpuFunctions = await drizzleDb.findGPUFunctions();

  // For each GPU function, find who calls it (CPU->GPU boundary)
  for (const gpuFunc of gpuFunctions) {
    const callers = await drizzleDb.getCallersOfSymbol(gpuFunc.id);

    for (const caller of callers) {
      // Check if caller is CPU-side
      const callerInfo = await drizzleDb.getSymbolExecutionInfo(caller.fromSymbolId);

      if (!callerInfo?.usesGpuCompute) {
        // This is a CPU->GPU dispatch
        await drizzleDb.insertGPUDispatchRelationship(
          caller.fromSymbolId,
          gpuFunc.id,
          `CPU->GPU dispatch to ${gpuFunc.qualifiedName}`
        );
      }
    }
  }
}

/**
 * Infer data flow relationships based on function signatures and call relationships using DrizzleDatabase.
 * This is a simplified heuristic based on type matching.
 */
export async function inferDataFlow(
  drizzleDb: any,
  projectId: number
): Promise<number> {
  console.log("Inferring data flow relationships...");
  let inferredCount = 0;

  // Get all function/method symbols with return types and parameters
  const functionsWithSignatures = await drizzleDb.getFunctionsWithSignatures(projectId);

  const signatureMap = new Map<
    number,
    { returnType: string | null; paramTypes: string[] }
  >();
  functionsWithSignatures.forEach((func: any) => {
    const returnTypeMatch = func.signature?.match(/^(.*?)\s+\w+\s*\(.*\)/);
    const returnType = returnTypeMatch ? returnTypeMatch[1].trim() : null;

    const paramTypes: string[] = [];
    const paramsMatch = func.signature?.match(/\((.*?)\)/);
    if (paramsMatch && paramsMatch[1]) {
      paramsMatch[1].split(",").forEach((param: string) => {
        const typeMatch = param.trim().match(/^(.*?)\s+\w+$/); // Basic type extraction
        if (typeMatch) {
          paramTypes.push(typeMatch[1].trim());
        }
      });
    }
    signatureMap.set(func.id, { returnType, paramTypes });
  });

  // Get all existing call relationships
  const callRelationships = await drizzleDb.getCallRelationships(projectId);

  for (const callRel of callRelationships) {
    // Skip if either ID is null
    if (!callRel.fromSymbolId || !callRel.toSymbolId) continue;

    const callerSignature = signatureMap.get(callRel.fromSymbolId);
    const calleeSignature = signatureMap.get(callRel.toSymbolId);

    if (callerSignature && calleeSignature) {
      // Heuristic 1: Caller's return type matches Callee's first parameter type
      if (
        callerSignature.returnType &&
        calleeSignature.paramTypes.length > 0 &&
        callerSignature.returnType === calleeSignature.paramTypes[0]
      ) {
        await drizzleDb.insertDataFlowRelationship({
          projectId,
          fromSymbolId: callRel.fromSymbolId,
          toSymbolId: callRel.toSymbolId,
          type: "passes_data_via_return",
          confidence: 0.7, // Lower confidence for heuristic
          contextSnippet: `Caller returns ${callerSignature.returnType}, Callee takes it as first param`,
        });
        inferredCount++;
      }

      // Heuristic 2: If caller has parameters, and callee takes parameters, assume data flow
      // This is very broad and might need refinement with more AST context
      if (
        callerSignature.paramTypes.length > 0 &&
        calleeSignature.paramTypes.length > 0
      ) {
        // This is a very weak heuristic without knowing *which* parameters are passed
        // and how they map. A more robust solution requires AST of the call site.
        // For now, we'll just note that data *might* flow.
        await drizzleDb.insertDataFlowRelationship({
          projectId,
          fromSymbolId: callRel.fromSymbolId,
          toSymbolId: callRel.toSymbolId,
          type: "passes_data_via_params_heuristic",
          confidence: 0.3, // Very low confidence
          contextSnippet: `Caller has params, Callee takes params`,
        });
        inferredCount++;
      }
    }
  }

  return inferredCount;
}

/**
 * Discover virtual override relationships using DrizzleDatabase.
 */
export async function discoverVirtualOverrides(
  drizzleDb: any,
  projectId: number
): Promise<number> {
  console.log("Discovering virtual override relationships...");
  let inferredCount = 0;

  // Get all classes/structs
  const classes = await drizzleDb.getClassesAndStructs(projectId);

  const classMethods = await drizzleDb.getClassMethods(projectId);

  for (const childClass of classes) {
    // Find inheritance relationships for this class
    const inheritedFrom = await drizzleDb.getInheritanceRelationships(projectId, childClass.id);

    for (const inheritanceRel of inheritedFrom) {
      const parentClassId = inheritanceRel.toSymbolId;
      const parentClassMethods = classMethods.filter(
        (m: any) => m.parentSymbolId === parentClassId
      );
      const childClassMethods = classMethods.filter(
        (m: any) => m.parentSymbolId === childClass.id
      );

      for (const parentMethod of parentClassMethods) {
        // Simple heuristic: method name and signature match
        const overridingMethod = childClassMethods.find(
          (childMethod: any) =>
            childMethod.name === parentMethod.name &&
            childMethod.signature === parentMethod.signature
        );

        if (overridingMethod) {
          await drizzleDb.insertDataFlowRelationship({
            projectId,
            fromSymbolId: overridingMethod.id,
            toSymbolId: parentMethod.id,
            type: "overrides",
            confidence: 0.9,
            contextSnippet: `Method ${overridingMethod.qualifiedName} overrides ${parentMethod.qualifiedName}`,
          });
          inferredCount++;
        }
      }
    }
  }

  return inferredCount;
}
