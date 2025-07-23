/**
 * Relationship enrichment strategies we could implement
 * based on existing symbol data
 */

import Parser from 'tree-sitter';
import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, or, inArray, sql, isNull } from 'drizzle-orm';

// Import schema
import { 
  universalSymbols,
  universalRelationships,
  detectedPatterns,
  projectLanguages
} from '../database/schema/universal.js';

export interface EnrichmentStrategy {
  name: string;
  description: string;
  requiredData: string[];
  produces: string[];
}

export const relationshipEnrichmentStrategies: EnrichmentStrategy[] = [
  {
    name: "ResolveSymbolReferences",
    description: "Match unresolved to_symbol_id using qualified names and signatures",
    requiredData: ["qualified_name", "signature", "file_path"],
    produces: ["resolved to_symbol_id links", "cross-module dependencies"]
  },
  {
    name: "ExtractTemplateRelationships",
    description: "Find template instantiation relationships from template_params",
    requiredData: ["template_params", "signature"],
    produces: ["instantiates", "specializes", "template dependency graph"]
  },
  {
    name: "InferDataFlow",
    description: "Track data transformations through return types and parameters",
    requiredData: ["signature", "return_type", "pipeline_stage"],
    produces: ["transforms_data", "data flow paths", "pipeline transitions"]
  },
  {
    name: "DiscoverVirtualOverrides",
    description: "Find virtual function override relationships",
    requiredData: ["is_virtual", "base_type", "qualified_name"],
    produces: ["overrides", "implements", "polymorphic call sites"]
  },
  {
    name: "BuildCallChains",
    description: "Construct execution paths from existing call relationships",
    requiredData: ["calls relationships", "pipeline_stage", "execution_mode"],
    produces: ["call_chains", "execution_paths", "critical paths"]
  },
  {
    name: "IdentifyGPUDispatches",
    description: "Find GPU compute dispatch points and data transfers",
    requiredData: ["uses_gpu_compute", "execution_mode", "signature"],
    produces: ["dispatches_to_gpu", "gpu_data_transfer", "compute kernels"]
  },
  {
    name: "ExtractFactoryPatterns",
    description: "Enhance factory relationships with product types",
    requiredData: ["factory_product relationships", "return_type", "template_params"],
    produces: ["creates_instance", "factory registry", "product hierarchies"]
  },
  {
    name: "MapNamespaceHierarchy",
    description: "Build namespace containment and dependency graph",
    requiredData: ["namespace", "qualified_name"],
    produces: ["namespace_contains", "namespace_depends_on", "module boundaries"]
  },
  {
    name: "TrackMemoryPatterns",
    description: "Identify memory allocation and ownership patterns",
    requiredData: ["signature", "return_type", "semantic_tags"],
    produces: ["allocates", "owns", "shares", "memory lifecycle"]
  },
  {
    name: "InferComponentDependencies",
    description: "Discover architectural component relationships",
    requiredData: ["pipeline_stage", "file_path", "namespace"],
    produces: ["component_depends_on", "layer_violations", "architectural flow"]
  }
];

/**
 * Example implementation for resolving symbol references
 */
export async function resolveSymbolReferences(db: any): Promise<number> {
  // First, create an index of all symbols by qualified name
  const symbolIndex = new Map<string, number>();
  
  const symbols = db.prepare(`
    SELECT id, qualified_name, name, signature, file_path
    FROM enhanced_symbols
    WHERE qualified_name IS NOT NULL
  `).all();
  
  symbols.forEach((sym: any) => {
    symbolIndex.set(sym.qualified_name, sym.id);
    // Also index by simple name for fallback
    if (!symbolIndex.has(sym.name)) {
      symbolIndex.set(sym.name, sym.id);
    }
  });
  
  // Update relationships with resolved IDs
  const unresolvedRels = db.prepare(`
    SELECT id, to_name, from_symbol_id
    FROM symbol_relationships
    WHERE to_symbol_id IS NULL AND to_name IS NOT NULL
  `).all();
  
  let resolved = 0;
  const updateStmt = db.prepare(`
    UPDATE symbol_relationships 
    SET to_symbol_id = ? 
    WHERE id = ?
  `);
  
  for (const rel of unresolvedRels) {
    const toId = symbolIndex.get(rel.to_name);
    if (toId) {
      updateStmt.run(toId, rel.id);
      resolved++;
    }
  }
  
  return resolved;
}

/**
 * Build execution call chains from resolved relationships
 */
export async function buildCallChains(db: any): Promise<void> {
  // Find entry points (functions not called by others)
  const entryPoints = db.prepare(`
    SELECT DISTINCT s.id, s.qualified_name
    FROM enhanced_symbols s
    WHERE s.kind IN ('function', 'method')
      AND s.id NOT IN (
        SELECT DISTINCT to_symbol_id 
        FROM symbol_relationships 
        WHERE relationship_type = 'calls' 
          AND to_symbol_id IS NOT NULL
      )
  `).all();
  
  // For each entry point, trace call chains
  const insertChain = db.prepare(`
    INSERT INTO call_chains (entry_point_id, max_depth, total_nodes)
    VALUES (?, ?, ?)
  `);
  
  const insertStep = db.prepare(`
    INSERT INTO call_chain_steps (chain_id, step_number, symbol_id, caller_id)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const entry of entryPoints) {
    const chain = traceCallChain(db, entry.id, 10);
    if (chain.length > 1) {
      const result = insertChain.run(entry.id, chain.length, chain.length);
      const chainId = result.lastInsertRowid;
      
      chain.forEach((step, index) => {
        insertStep.run(chainId, index, step.symbolId, step.callerId || null);
      });
    }
  }
}

function traceCallChain(db: any, startId: number, maxDepth: number): any[] {
  const chain: any[] = [];
  const visited = new Set<number>();
  
  function trace(symbolId: number, depth: number, callerId: number | null) {
    if (visited.has(symbolId) || depth > maxDepth) return;
    
    visited.add(symbolId);
    chain.push({ symbolId, callerId, depth });
    
    // Get all functions this symbol calls
    const calls = db.prepare(`
      SELECT DISTINCT to_symbol_id
      FROM symbol_relationships
      WHERE from_symbol_id = ?
        AND relationship_type = 'calls'
        AND to_symbol_id IS NOT NULL
    `).all(symbolId);
    
    for (const call of calls) {
      trace(call.to_symbol_id, depth + 1, symbolId);
    }
  }
  
  trace(startId, 0, null);
  return chain;
}

/**
 * Extract GPU dispatch relationships
 */
export async function extractGPUDispatches(db: any): Promise<void> {
  // Find GPU compute functions
  const gpuFunctions = db.prepare(`
    SELECT id, qualified_name, signature
    FROM enhanced_symbols
    WHERE uses_gpu_compute = 1
      OR execution_mode = 'gpu'
      OR signature LIKE '%kernel%'
      OR signature LIKE '%dispatch%'
      OR signature LIKE '%compute%'
  `).all();
  
  // For each GPU function, find who calls it (CPU->GPU boundary)
  const insertRel = db.prepare(`
    INSERT INTO symbol_relationships 
    (from_symbol_id, to_symbol_id, relationship_type, from_name, to_name)
    VALUES (?, ?, 'dispatches_to_gpu', ?, ?)
  `);
  
  for (const gpuFunc of gpuFunctions) {
    const callers = db.prepare(`
      SELECT DISTINCT from_symbol_id, from_name
      FROM symbol_relationships
      WHERE to_symbol_id = ?
        AND relationship_type = 'calls'
    `).all(gpuFunc.id);
    
    for (const caller of callers) {
      // Check if caller is CPU-side
      const callerInfo = db.prepare(`
        SELECT execution_mode, uses_gpu_compute
        FROM enhanced_symbols
        WHERE id = ?
      `).get(caller.from_symbol_id);
      
      if (!callerInfo?.uses_gpu_compute && callerInfo?.execution_mode !== 'gpu') {
        // This is a CPU->GPU dispatch
        insertRel.run(
          caller.from_symbol_id,
          gpuFunc.id,
          caller.from_name,
          gpuFunc.qualified_name
        );
      }
    }
  }
}

/**
 * Infer data flow relationships based on function signatures and call relationships.
 * This is a simplified heuristic based on type matching.
 */
export async function inferDataFlow(db: ReturnType<typeof drizzle>, projectId: number): Promise<number> {
  console.log('Inferring data flow relationships...');
  let inferredCount = 0;

  // Get all function/method symbols with return types and parameters
  const functionsWithSignatures = await db.select()
    .from(universalSymbols)
    .where(and(
      eq(universalSymbols.projectId, projectId),
      or(
        eq(universalSymbols.kind, 'function'),
        eq(universalSymbols.kind, 'method')
      ),
      sql`${universalSymbols.signature} IS NOT NULL`
    ));

  const signatureMap = new Map<number, { returnType: string | null; paramTypes: string[] }>();
  functionsWithSignatures.forEach(func => {
    const returnTypeMatch = func.signature?.match(/^(.*?)\s+\w+\s*\(.*\)/);
    const returnType = returnTypeMatch ? returnTypeMatch[1].trim() : null;

    const paramTypes: string[] = [];
    const paramsMatch = func.signature?.match(/\((.*?)\)/);
    if (paramsMatch && paramsMatch[1]) {
      paramsMatch[1].split(',').forEach((param: string) => {
        const typeMatch = param.trim().match(/^(.*?)\s+\w+$/); // Basic type extraction
        if (typeMatch) {
          paramTypes.push(typeMatch[1].trim());
        }
      });
    }
    signatureMap.set(func.id, { returnType, paramTypes });
  });

  // Get all existing call relationships
  const callRelationships = await db.select()
    .from(universalRelationships)
    .where(and(
      eq(universalRelationships.projectId, projectId),
      eq(universalRelationships.type, 'calls')
    ));

  const insertRelationship = db.insert(universalRelationships).values;

  for (const callRel of callRelationships) {
    // Skip if either ID is null
    if (!callRel.fromSymbolId || !callRel.toSymbolId) continue;
    
    const callerSignature = signatureMap.get(callRel.fromSymbolId);
    const calleeSignature = signatureMap.get(callRel.toSymbolId);

    if (callerSignature && calleeSignature) {
      // Heuristic 1: Caller's return type matches Callee's first parameter type
      if (callerSignature.returnType && calleeSignature.paramTypes.length > 0 &&
          callerSignature.returnType === calleeSignature.paramTypes[0]) {
        await insertRelationship({
          projectId,
          fromSymbolId: callRel.fromSymbolId,
          toSymbolId: callRel.toSymbolId,
          type: 'passes_data_via_return',
          confidence: 0.7, // Lower confidence for heuristic
          contextSnippet: `Caller returns ${callerSignature.returnType}, Callee takes it as first param`
        });
        inferredCount++;
      }

      // Heuristic 2: If caller has parameters, and callee takes parameters, assume data flow
      // This is very broad and might need refinement with more AST context
      if (callerSignature.paramTypes.length > 0 && calleeSignature.paramTypes.length > 0) {
        // This is a very weak heuristic without knowing *which* parameters are passed
        // and how they map. A more robust solution requires AST of the call site.
        // For now, we'll just note that data *might* flow.
        await insertRelationship({
          projectId,
          fromSymbolId: callRel.fromSymbolId,
          toSymbolId: callRel.toSymbolId,
          type: 'passes_data_via_params_heuristic',
          confidence: 0.3, // Very low confidence
          contextSnippet: `Caller has params, Callee takes params`
        });
        inferredCount++;
      }
    }
  }

  console.log(`Inferred ${inferredCount} data flow relationships.`);
  return inferredCount;
}

/**
 * Discover virtual override relationships.
 */
export async function discoverVirtualOverrides(db: ReturnType<typeof drizzle>, projectId: number): Promise<number> {
  console.log('Discovering virtual override relationships...');
  let inferredCount = 0;

  // Get all classes/structs
  const classes = await db.select()
    .from(universalSymbols)
    .where(and(
      eq(universalSymbols.projectId, projectId),
      or(
        eq(universalSymbols.kind, 'class'),
        eq(universalSymbols.kind, 'struct')
      )
    ));

  const classMethods = await db.select()
    .from(universalSymbols)
    .where(and(
      eq(universalSymbols.projectId, projectId),
      or(
        eq(universalSymbols.kind, 'method')
      ),
      sql`${universalSymbols.parentSymbolId} IS NOT NULL` // Ensure it's a method of a class/struct
    ));

  const insertRelationship = db.insert(universalRelationships).values;

  for (const childClass of classes) {
    // Find inheritance relationships for this class
    const inheritedFrom = await db.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, projectId),
        eq(universalRelationships.fromSymbolId, childClass.id),
        eq(universalRelationships.type, 'inherits')
      ));

    for (const inheritanceRel of inheritedFrom) {
      const parentClassId = inheritanceRel.toSymbolId;
      const parentClassMethods = classMethods.filter(m => m.parentId === parentClassId);
      const childClassMethods = classMethods.filter(m => m.parentId === childClass.id);

      for (const parentMethod of parentClassMethods) {
        // Simple heuristic: method name and signature match
        const overridingMethod = childClassMethods.find(childMethod =>
          childMethod.name === parentMethod.name &&
          childMethod.signature === parentMethod.signature
        );

        if (overridingMethod) {
          await insertRelationship({
            projectId,
            fromSymbolId: overridingMethod.id,
            toSymbolId: parentMethod.id,
            type: 'overrides',
            confidence: 0.9,
            contextSnippet: `Method ${overridingMethod.qualifiedName} overrides ${parentMethod.qualifiedName}`
          });
          inferredCount++;
        }
      }
    }
  }

  console.log(`Discovered ${inferredCount} virtual override relationships.`);
  return inferredCount;
}
