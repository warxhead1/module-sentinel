import Database from 'better-sqlite3';

/**
 * Enhances existing symbol data with higher-level semantic relationships
 * Uses the data we already have to infer module connections and usage patterns
 */
export class SemanticRelationshipEnhancer {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Enhance all semantic relationships based on existing data
   */
  async enhanceAllRelationships(): Promise<void> {
    console.log('🧠 Enhancing semantic relationships...');
    
    await this.addInterfaceImplementations();
    await this.addTemplateSpecializations();
    await this.addFactoryPatterns();
    await this.addAsyncCallbackChains();
    await this.addResourceOwnership();
    await this.addDataFlowRelationships();
    await this.addPipelineDependencies();
    
    console.log('✅ Semantic relationship enhancement complete');
  }

  /**
   * Detect interface implementations and inheritance hierarchies
   */
  private async addInterfaceImplementations(): Promise<void> {
    console.log('  🏗️ Adding interface/inheritance relationships...');
    
    // Find inheritance through constructor signatures and member relationships
    const inheritancePatterns = this.db.prepare(`
      SELECT DISTINCT
        s1.id as derived_id,
        s1.qualified_name as derived_class,
        s2.id as base_id,
        s2.qualified_name as base_class
      FROM enhanced_symbols s1
      JOIN symbol_relationships sr ON s1.id = sr.from_symbol_id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.kind = 'class' 
        AND s2.kind = 'class'
        AND sr.relationship_type = 'calls'
        AND s1.name != s2.name
        AND (s2.name LIKE '%Base%' OR s2.name LIKE '%Interface%' OR s2.name LIKE '%Abstract%'
             OR s1.signature LIKE '%::%' || s2.name || '%')
    `).all();

    for (const pattern of inheritancePatterns as any[]) {
      this.addSemanticRelationship(
        pattern.derived_id,
        pattern.base_id,
        'inherits_from',
        0.8,
        `${pattern.derived_class} inherits from ${pattern.base_class}`
      );
    }

    // Find interface implementations through virtual method overrides
    const virtualOverrides = this.db.prepare(`
      SELECT DISTINCT
        s1.id as impl_method_id,
        s1.qualified_name as impl_method,
        s2.id as virtual_method_id,
        s2.qualified_name as virtual_method,
        s1.parent_class as impl_class,
        s2.parent_class as interface_class
      FROM enhanced_symbols s1
      JOIN enhanced_symbols s2 ON s1.name = s2.name
      WHERE s1.kind IN ('method', 'function')
        AND s2.kind IN ('method', 'function')
        AND s1.parent_class != s2.parent_class
        AND s1.parent_class IS NOT NULL
        AND s2.parent_class IS NOT NULL
        AND s2.signature LIKE '%virtual%'
        AND s1.signature NOT LIKE '%virtual%'
    `).all();

    for (const override of virtualOverrides as any[]) {
      this.addSemanticRelationship(
        override.impl_method_id,
        override.virtual_method_id,
        'overrides_virtual',
        0.85,
        `${override.impl_method} overrides ${override.virtual_method}`
      );
    }

    console.log(`    Added ${inheritancePatterns.length} inheritance + ${virtualOverrides.length} override relationships`);
  }

  /**
   * Detect template specializations and generic usage
   */
  private async addTemplateSpecializations(): Promise<void> {
    console.log('  🧩 Adding template/generic relationships...');
    
    // Find template instantiations in signatures
    const templateUsage = this.db.prepare(`
      SELECT DISTINCT
        s1.id as user_id,
        s1.qualified_name as user_name,
        s2.id as template_id,
        s2.qualified_name as template_name,
        s1.signature
      FROM enhanced_symbols s1
      JOIN enhanced_symbols s2 ON s1.signature LIKE '%' || s2.name || '<%'
      WHERE s1.signature LIKE '%<%'
        AND s2.template_params IS NOT NULL
        AND s1.id != s2.id
    `).all();

    for (const usage of templateUsage as any[]) {
      this.addSemanticRelationship(
        usage.user_id,
        usage.template_id,
        'instantiates_template',
        0.75,
        `${usage.user_name} instantiates template ${usage.template_name}`
      );
    }

    // Find callback template patterns
    const callbackTemplates = this.db.prepare(`
      SELECT id, qualified_name, signature
      FROM enhanced_symbols
      WHERE signature LIKE '%std::function<%'
        OR signature LIKE '%callback%'
        OR signature LIKE '%Callback%'
    `).all();

    for (const callback of callbackTemplates) {
      this.addSemanticTag((callback as any).id, 'callback_interface');
    }

    console.log(`    Added ${templateUsage.length} template instantiations + ${callbackTemplates.length} callback interfaces`);
  }

  /**
   * Detect factory patterns and creation relationships
   */
  private async addFactoryPatterns(): Promise<void> {
    console.log('  🏭 Adding factory pattern relationships...');
    
    // Find factory methods that create objects
    const factoryMethods = this.db.prepare(`
      SELECT DISTINCT
        f.id as factory_id,
        f.qualified_name as factory_method,
        p.id as product_id,
        p.qualified_name as product_class,
        f.return_type
      FROM enhanced_symbols f
      JOIN enhanced_symbols p ON f.return_type LIKE '%' || p.name || '%'
      WHERE (f.name LIKE '%Create%' OR f.name LIKE '%Make%' OR f.name LIKE '%Build%' OR f.name LIKE '%Factory%')
        AND f.kind = 'function'
        AND p.kind = 'class'
        AND f.return_type IS NOT NULL
        AND (f.return_type LIKE '%unique_ptr%' OR f.return_type LIKE '%shared_ptr%' OR f.return_type LIKE '%*%')
    `).all();

    for (const factory of factoryMethods) {
      const f = factory as any;
      this.addSemanticRelationship(
        f.factory_id,
        f.product_id,
        'creates_instance',
        0.9,
        `${f.factory_method} creates ${f.product_class}`
      );
      
      this.addSemanticTag(f.factory_id, 'factory_method');
      this.addSemanticTag(f.product_id, 'factory_product');
    }

    // Find singleton patterns
    const singletons = this.db.prepare(`
      SELECT id, qualified_name
      FROM enhanced_symbols
      WHERE (name LIKE '%getInstance%' OR name LIKE '%instance%' OR name LIKE '%Instance%')
        AND kind = 'function'
        AND (signature LIKE '%static%' OR parent_class IS NOT NULL)
    `).all();

    for (const singleton of singletons) {
      this.addSemanticTag((singleton as any).id, 'singleton_access');
    }

    console.log(`    Added ${factoryMethods.length} factory patterns + ${singletons.length} singleton accessors`);
  }

  /**
   * Detect async/callback chains and event patterns
   */
  private async addAsyncCallbackChains(): Promise<void> {
    console.log('  ⚡ Adding async/callback relationships...');
    
    // Find callback registration patterns
    const callbackRegistrations = this.db.prepare(`
      SELECT DISTINCT
        s1.id as registrar_id,
        s1.qualified_name as registrar,
        s2.id as callback_id,
        s2.qualified_name as callback_type
      FROM enhanced_symbols s1
      JOIN symbol_relationships sr ON s1.id = sr.from_symbol_id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE (s1.name LIKE '%Set%Callback%' OR s1.name LIKE '%Register%' OR s1.name LIKE '%Subscribe%')
        AND (s2.signature LIKE '%function<%' OR s2.signature LIKE '%callback%')
    `).all();

    for (const registration of callbackRegistrations) {
      const r = registration as any;
      this.addSemanticRelationship(
        r.registrar_id,
        r.callback_id,
        'registers_callback',
        0.85,
        `${r.registrar} registers ${r.callback_type}`
      );
    }

    // Find event emission patterns
    const eventEmitters = this.db.prepare(`
      SELECT id, qualified_name
      FROM enhanced_symbols
      WHERE (name LIKE 'On%' OR name LIKE '%Event%' OR name LIKE '%Notify%' OR name LIKE '%Emit%')
        AND kind IN ('function', 'method')
    `).all();

    for (const emitter of eventEmitters) {
      this.addSemanticTag((emitter as any).id, 'event_emitter');
    }

    console.log(`    Added ${callbackRegistrations.length} callback registrations + ${eventEmitters.length} event emitters`);
  }

  /**
   * Detect resource ownership and management patterns
   */
  private async addResourceOwnership(): Promise<void> {
    console.log('  🔒 Adding resource ownership relationships...');
    
    // Find RAII patterns through constructor/destructor pairs
    const raiiPatterns = this.db.prepare(`
      SELECT DISTINCT
        c.id as constructor_id,
        c.qualified_name as constructor_name,
        d.id as destructor_id,
        d.qualified_name as destructor_name,
        c.parent_class
      FROM enhanced_symbols c
      JOIN enhanced_symbols d ON c.parent_class = d.parent_class
      WHERE c.kind = 'constructor'
        AND d.kind = 'destructor'
        AND c.parent_class IS NOT NULL
    `).all();

    for (const raii of raiiPatterns) {
      const r = raii as any;
      this.addSemanticRelationship(
        r.constructor_id,
        r.destructor_id,
        'raii_pair',
        0.95,
        `Constructor/destructor RAII pair in ${r.parent_class}`
      );
    }

    // Find resource managers
    const resourceManagers = this.db.prepare(`
      SELECT id, qualified_name, parent_class
      FROM enhanced_symbols
      WHERE (name LIKE '%Manager%' OR name LIKE '%Pool%' OR name LIKE '%Registry%' OR name LIKE '%Cache%')
        AND kind = 'class'
    `).all();

    for (const manager of resourceManagers) {
      this.addSemanticTag((manager as any).id, 'resource_manager');
    }

    console.log(`    Added ${raiiPatterns.length} RAII pairs + ${resourceManagers.length} resource managers`);
  }

  /**
   * Detect data flow relationships through parameter types
   */
  private async addDataFlowRelationships(): Promise<void> {
    console.log('  🌊 Adding data flow relationships...');
    
    // Find producer-consumer relationships through return/parameter types
    const dataFlow = this.db.prepare(`
      SELECT DISTINCT
        producer.id as producer_id,
        producer.qualified_name as producer_name,
        consumer.id as consumer_id,
        consumer.qualified_name as consumer_name,
        producer.return_type as data_type
      FROM enhanced_symbols producer
      JOIN enhanced_symbols consumer ON consumer.signature LIKE '%' || producer.return_type || '%'
      WHERE producer.return_type IS NOT NULL
        AND producer.return_type != 'void'
        AND producer.return_type != ''
        AND producer.kind = 'function'
        AND consumer.kind = 'function'
        AND producer.id != consumer.id
        AND producer.return_type NOT IN ('int', 'float', 'bool', 'char', 'string')
    `).all();

    for (const flow of dataFlow) {
      const f = flow as any;
      this.addSemanticRelationship(
        f.producer_id,
        f.consumer_id,
        'data_flow',
        0.7,
        `${f.producer_name} produces ${f.data_type} for ${f.consumer_name}`
      );
    }

    console.log(`    Added ${dataFlow.length} data flow relationships`);
  }

  /**
   * Detect pipeline dependencies based on pipeline stages
   */
  private async addPipelineDependencies(): Promise<void> {
    console.log('  🔄 Adding pipeline dependency relationships...');
    
    // Define pipeline stage order
    const stageOrder = {
      'noise_generation': 1,
      'terrain_formation': 2,
      'atmospheric_dynamics': 3,
      'geological_processes': 4,
      'ecosystem_simulation': 5,
      'weather_systems': 6,
      'final_rendering': 7
    };

    // Find dependencies between pipeline stages
    const stageDependencies = this.db.prepare(`
      SELECT DISTINCT
        s1.id as from_stage_symbol,
        s1.qualified_name as from_symbol,
        s1.pipeline_stage as from_stage,
        s2.id as to_stage_symbol,
        s2.qualified_name as to_symbol,
        s2.pipeline_stage as to_stage
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.pipeline_stage != 'unknown'
        AND s2.pipeline_stage != 'unknown'
        AND s1.pipeline_stage != s2.pipeline_stage
    `).all();

    for (const dep of stageDependencies) {
      const d = dep as any;
      const fromOrder = stageOrder[d.from_stage as keyof typeof stageOrder] || 0;
      const toOrder = stageOrder[d.to_stage as keyof typeof stageOrder] || 0;
      
      if (fromOrder < toOrder) {
        this.addSemanticRelationship(
          d.from_stage_symbol,
          d.to_stage_symbol,
          'pipeline_feeds_into',
          0.8,
          `${d.from_stage} feeds into ${d.to_stage}`
        );
      } else if (fromOrder > toOrder) {
        this.addSemanticRelationship(
          d.from_stage_symbol,
          d.to_stage_symbol,
          'pipeline_depends_on',
          0.8,
          `${d.from_stage} depends on ${d.to_stage}`
        );
      }
    }

    console.log(`    Added ${stageDependencies.length} pipeline dependencies`);
  }

  /**
   * Add a semantic relationship between two symbols
   */
  private addSemanticRelationship(
    fromSymbolId: number,
    toSymbolId: number,
    relationshipType: string,
    confidence: number,
    description: string
  ): void {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO symbol_relationships 
        (from_symbol_id, to_symbol_id, relationship_type, confidence, source_text, line_number)
        VALUES (?, ?, ?, ?, ?, NULL)
      `).run(fromSymbolId, toSymbolId, relationshipType, confidence, description);
    } catch (error) {
      // Ignore duplicates
    }
  }

  /**
   * Add a semantic tag to a symbol
   */
  private addSemanticTag(symbolId: number, tag: string): void {
    try {
      const symbol = this.db.prepare('SELECT semantic_tags FROM enhanced_symbols WHERE id = ?').get(symbolId) as any;
      if (symbol) {
        const currentTags = JSON.parse(symbol.semantic_tags || '[]');
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
          this.db.prepare('UPDATE enhanced_symbols SET semantic_tags = ? WHERE id = ?')
            .run(JSON.stringify(currentTags), symbolId);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  close(): void {
    this.db.close();
  }
}

// CLI usage
if (require.main === module) {
  const dbPath = process.argv[2] || 'module-sentinel.db';
  console.log(`🧠 Enhancing semantic relationships in ${dbPath}...`);
  
  const enhancer = new SemanticRelationshipEnhancer(dbPath);
  enhancer.enhanceAllRelationships()
    .then(() => {
      enhancer.close();
      console.log('✅ Semantic enhancement complete!');
    })
    .catch(error => {
      console.error('❌ Enhancement failed:', error);
      enhancer.close();
      process.exit(1);
    });
}