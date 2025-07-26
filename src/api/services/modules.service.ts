/**
 * Modules service for handling file-based module organization
 */
import type Database from 'better-sqlite3';
import type { ModuleFile, FileInfo } from '../../shared/types/api.js';
import { DrizzleDatabase, type DrizzleDb } from '../../database/drizzle-db.js';

interface ModuleNode {
  name: string;
  qualifiedName: string;
  kind: 'namespace' | 'module';
  children: ModuleNode[];
  symbolCount?: number;
  symbolKinds?: string[];
  files?: FileInfo[];
  imports?: string[];
  moduleData?: ModuleFile;
}

export class ModulesService {
  private drizzleDb: DrizzleDatabase;

  constructor(database: Database.Database | DrizzleDb) {
    this.drizzleDb = new DrizzleDatabase(database);
  }

  /**
   * Get all modules organized by namespace hierarchy
   */
  async getModulesHierarchy(): Promise<ModuleNode[]> {
    // Get all files with symbols, focusing on actual files (.ixx/.cpp)
    const fileSymbols = await this.drizzleDb.getFileSymbolsForModules() as Array<{
      file_path: string;
      namespace: string;
      symbol_count: number;
      file_type: string;
      symbol_kinds: string;
    }>;

    // Get imports/includes for context
    const imports = await this.drizzleDb.getModuleImports() as Array<{
      from_file: string;
      imported_name: string;
      imported_qualified_name: string;
      imported_namespace: string;
    }>;

    // Build import map
    const importMap = new Map<string, Set<string>>();
    imports.forEach(imp => {
      if (!importMap.has(imp.from_file)) {
        importMap.set(imp.from_file, new Set());
      }
      importMap.get(imp.from_file)!.add(imp.imported_qualified_name || imp.imported_name);
    });

    // Group files by file path to combine related .ixx/.cpp pairs
    const fileGroups = new Map<string, ModuleFile>();
    
    fileSymbols.forEach(file => {
      // Extract base name without extension to group .ixx/.cpp pairs
      const baseName = file.file_path.replace(/\.(ixx|cpp)$/, '');
      const fileName = baseName.split('/').pop() || baseName;
      
      const key = `${file.namespace}::${fileName}`;
      if (!fileGroups.has(key)) {
        fileGroups.set(key, {
          name: fileName,
          qualifiedName: `${file.namespace}::${fileName}`,
          namespace: file.namespace,
          kind: 'module', // Mark as module/file instead of individual symbol
          files: [],
          imports: [],
          symbolCount: 0,
          symbolKinds: [],
          children: []
        });
      }
      
      const group = fileGroups.get(key)!;
      group.files.push({
        path: file.file_path,
        type: file.file_type as 'interface' | 'implementation' | 'other',
        symbolCount: file.symbol_count,
        symbolKinds: file.symbol_kinds
      });
      
      group.symbolCount += file.symbol_count;
      if (file.symbol_kinds) {
        file.symbol_kinds.split(',').forEach(kind => {
          if (!group.symbolKinds.includes(kind.trim())) {
            group.symbolKinds.push(kind.trim());
          }
        });
      }

      // Add imports for this file
      const fileImports = importMap.get(file.file_path);
      if (fileImports) {
        fileImports.forEach(imp => {
          if (!group.imports.includes(imp)) {
            group.imports.push(imp);
          }
        });
      }
    });

    // Get top-level symbols for each file to show as children
    const topLevelSymbols = await this.drizzleDb.getTopLevelSymbolsForModules() as Array<{
      file_path: string;
      name: string;
      qualified_name: string;
      kind: string;
      return_type: string | null;
      signature: string | null;
      visibility: string;
      namespace: string;
    }>;

    // Add top-level symbols to their file groups
    topLevelSymbols.forEach(symbol => {
      const baseName = symbol.file_path.replace(/\.(ixx|cpp)$/, '');
      const fileName = baseName.split('/').pop() || baseName;
      const key = `${symbol.namespace}::${fileName}`;
      
      const group = fileGroups.get(key);
      if (group) {
        group.children.push({
          id: 0, // Will be filled properly in a real implementation
          name: symbol.name,
          qualified_name: symbol.qualified_name,
          kind: symbol.kind,
          namespace: symbol.namespace,
          file_path: symbol.file_path,
          line: 0,
          column: 0,
          return_type: symbol.return_type || undefined,
          signature: symbol.signature || undefined,
          visibility: symbol.visibility,
          is_exported: false,
          language_id: 0,
          project_id: 0
        });
      }
    });

    // Build hierarchical namespace structure
    return this.buildModuleHierarchy(fileGroups);
  }

  /**
   * Build namespace hierarchy from file groups
   */
  private buildModuleHierarchy(fileGroups: Map<string, ModuleFile>) {

    const root: ModuleNode = {
      name: 'root',
      qualifiedName: '',
      kind: 'namespace',
      children: []
    };

    // Build namespace hierarchy
    const namespaceMap = new Map<string, ModuleNode>();
    namespaceMap.set('', root);

    // Process each file group
    fileGroups.forEach((fileGroup) => {
      const namespaceParts = fileGroup.namespace.split('::').filter(p => p);
      let currentPath = '';
      let parentNode = root;

      // Build namespace path
      namespaceParts.forEach((part: string) => {
        currentPath = currentPath ? `${currentPath}::${part}` : part;
        
        if (!namespaceMap.has(currentPath)) {
          const namespaceNode: ModuleNode = {
            name: part,
            qualifiedName: currentPath,
            kind: 'namespace',
            children: []
          };
          
          parentNode.children.push(namespaceNode);
          namespaceMap.set(currentPath, namespaceNode);
          parentNode = namespaceNode;
        } else {
          parentNode = namespaceMap.get(currentPath)!;
        }
      });

      // Create file/module node
      const fileNode: ModuleNode = {
        name: fileGroup.name,
        qualifiedName: fileGroup.qualifiedName,
        kind: 'module',
        files: fileGroup.files,
        imports: fileGroup.imports,
        symbolCount: fileGroup.symbolCount,
        symbolKinds: fileGroup.symbolKinds,
        children: [],
        moduleData: fileGroup
      };

      parentNode.children.push(fileNode);
    });

    // Sort all nodes
    const sortNodes = (node: ModuleNode) => {
      node.children.sort((a, b) => {
        // Namespaces first, then modules/files
        if (a.kind === 'namespace' && b.kind !== 'namespace') return -1;
        if (a.kind !== 'namespace' && b.kind === 'namespace') return 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortNodes);
    };

    sortNodes(root);
    return root.children; // Return children to avoid showing 'root'
  }

  /**
   * Get detailed information for a specific module
   */
  async getModuleDetails(namespace: string, moduleName: string) {
    const filePath = `%${moduleName}%`;
    
    const symbols = await this.drizzleDb.getModuleDetailsByNamespace(namespace, filePath);

    return symbols;
  }
}