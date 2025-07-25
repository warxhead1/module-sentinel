import Database from "better-sqlite3";

/**
 * Tracks specific API usage patterns like Vulkan, OpenGL, etc.
 * Focuses on finding usage of external APIs and their patterns
 */
export class APIUsageTracker {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Track all API usage patterns
   */
  async trackAllAPIUsage(): Promise<void> {
    console.log("🔍 Tracking API usage patterns...");

    await this.trackVulkanAPI();
    await this.trackOpenGLAPI();
    await this.trackSTLUsage();
    await this.trackFileSystemAPI();
    await this.trackThreadingAPI();

    console.log("✅ API usage tracking complete");
  }

  /**
   * Track Vulkan API usage patterns
   */
  private async trackVulkanAPI(): Promise<void> {
    console.log("  🌋 Tracking Vulkan API usage...");

    // Find all Vulkan function calls
    const vulkanCalls = this.db
      .prepare(
        `
      SELECT s.id, s.qualified_name, s.signature
      FROM universal_symbols s
      WHERE (s.name LIKE 'vk%' OR s.name LIKE 'Vk%' 
             OR s.signature LIKE '%Vk%')
        AND s.kind IN ('function', 'method')
    `
      )
      .all() as any[];

    // Also find Vulkan usage in relationships
    const vulkanRelationships = this.db
      .prepare(
        `
      SELECT DISTINCT sr.from_symbol_id as id
      FROM universal_relationships sr
      WHERE sr.source_text LIKE '%vk%' OR sr.source_text LIKE '%Vk%'
    `
      )
      .all() as any[];

    const allVulkanUsages = [...vulkanCalls, ...vulkanRelationships];

    // Categorize Vulkan API usage
    const vulkanCategories = {
      buffer_management: [
        "VkBuffer",
        "vkCreateBuffer",
        "vkBindBufferMemory",
        "vkMapMemory",
        "vkUnmapMemory",
      ],
      command_recording: [
        "VkCommandBuffer",
        "vkBeginCommandBuffer",
        "vkEndCommandBuffer",
        "vkCmdDraw",
      ],
      pipeline_creation: [
        "VkPipeline",
        "vkCreateGraphicsPipelines",
        "vkCreateComputePipelines",
      ],
      descriptor_sets: [
        "VkDescriptorSet",
        "vkCreateDescriptorSetLayout",
        "vkUpdateDescriptorSets",
      ],
      synchronization: [
        "VkSemaphore",
        "VkFence",
        "vkWaitForFences",
        "vkCreateSemaphore",
      ],
      memory_management: ["VkDeviceMemory", "vkAllocateMemory", "vkFreeMemory"],
      render_passes: [
        "VkRenderPass",
        "vkCreateRenderPass",
        "vkCmdBeginRenderPass",
      ],
      swapchain: [
        "VkSwapchainKHR",
        "vkCreateSwapchainKHR",
        "vkAcquireNextImageKHR",
      ],
    };

    for (const [category, patterns] of Object.entries(vulkanCategories)) {
      const categoryUsages = allVulkanUsages.filter((call) =>
        patterns.some(
          (pattern) =>
            call.qualified_name?.includes(pattern) ||
            call.signature?.includes(pattern)
        )
      );

      for (const usage of categoryUsages) {
        this.addSemanticTag(usage.id, `vulkan_${category}`);
        this.addSemanticTag(usage.id, "external_api_vulkan");
      }
    }

    // Find Vulkan buffer lifecycle patterns
    await this.trackVulkanBufferLifecycle();
  }

  /**
   * Track Vulkan buffer lifecycle (create -> bind -> use -> destroy)
   */
  private async trackVulkanBufferLifecycle(): Promise<void> {
    console.log("    🔄 Tracking Vulkan buffer lifecycle...");

    // Find buffer creation patterns
    const bufferCreators = this.db
      .prepare(
        `
      SELECT s.id, s.qualified_name, s.parent_class
      FROM universal_symbols s
      WHERE (s.signature LIKE '%VkBuffer%' OR s.signature LIKE '%vkCreateBuffer%')
        AND s.kind IN ('function', 'method')
    `
      )
      .all() as any[];

    // Find buffer usage patterns
    const bufferUsers = this.db
      .prepare(
        `
      SELECT s.id, s.qualified_name, s.parent_class
      FROM universal_symbols s
      WHERE (s.signature LIKE '%VkBuffer%' AND s.name LIKE '%Bind%')
        OR (s.signature LIKE '%VkBuffer%' AND s.name LIKE '%Map%')
        OR (s.signature LIKE '%VkBuffer%' AND s.name LIKE '%Update%')
    `
      )
      .all() as any[];

    // Create relationships between buffer creators and users
    for (const creator of bufferCreators) {
      for (const user of bufferUsers) {
        if (
          creator.parent_class === user.parent_class ||
          this.isRelatedThroughCalls(creator.id, user.id)
        ) {
          this.addSemanticRelationship(
            creator.id,
            user.id,
            "buffer_lifecycle",
            0.8,
            `Buffer created by ${creator.qualified_name} used by ${user.qualified_name}`
          );
        }
      }
    }
  }

  /**
   * Track OpenGL API usage
   */
  private async trackOpenGLAPI(): Promise<void> {
    console.log("  🎨 Tracking OpenGL API usage...");

    const openglCalls = this.db
      .prepare(
        `
      SELECT id, qualified_name, signature
      FROM universal_symbols
      WHERE (name LIKE 'gl%' OR name LIKE 'GL_%' OR signature LIKE '%gl%')
        AND kind IN ('function', 'method')
    `
      )
      .all() as any[];

    for (const call of openglCalls) {
      this.addSemanticTag(call.id, "external_api_opengl");
    }
  }

  /**
   * Track STL usage patterns
   */
  private async trackSTLUsage(): Promise<void> {
    console.log("  📚 Tracking STL usage patterns...");

    const stlPatterns = {
      containers: ["vector", "map", "unordered_map", "set", "list", "array"],
      algorithms: ["std::sort", "std::find", "std::transform", "std::for_each"],
      smart_pointers: ["unique_ptr", "shared_ptr", "weak_ptr"],
      threading: ["thread", "mutex", "lock_guard", "condition_variable"],
      chrono: ["chrono::", "duration", "time_point"],
      functional: ["function<", "bind", "lambda"],
    };

    for (const [category, patterns] of Object.entries(stlPatterns)) {
      const usages = this.db
        .prepare(
          `
        SELECT id, qualified_name, signature
        FROM universal_symbols
        WHERE (${patterns.map((p) => `signature LIKE '%${p}%'`).join(" OR ")})
          AND kind IN ('function', 'method', 'variable')
      `
        )
        .all() as any[];

      for (const usage of usages) {
        this.addSemanticTag(usage.id, `stl_${category}`);
      }
    }
  }

  /**
   * Track file system API usage
   */
  private async trackFileSystemAPI(): Promise<void> {
    console.log("  📁 Tracking file system API usage...");

    const fileAPIs = this.db
      .prepare(
        `
      SELECT id, qualified_name, signature
      FROM universal_symbols
      WHERE (signature LIKE '%fstream%' OR signature LIKE '%ifstream%' OR signature LIKE '%ofstream%'
             OR signature LIKE '%filesystem::%' OR signature LIKE '%std::filesystem%'
             OR name LIKE '%File%' OR name LIKE '%Directory%')
        AND kind IN ('function', 'method')
    `
      )
      .all() as any[];

    for (const api of fileAPIs) {
      this.addSemanticTag(api.id, "filesystem_api");
    }
  }

  /**
   * Track threading API usage
   */
  private async trackThreadingAPI(): Promise<void> {
    console.log("  🧵 Tracking threading API usage...");

    const threadingAPIs = this.db
      .prepare(
        `
      SELECT id, qualified_name, signature
      FROM universal_symbols
      WHERE (signature LIKE '%thread%' OR signature LIKE '%mutex%' OR signature LIKE '%atomic%'
             OR signature LIKE '%future%' OR signature LIKE '%async%'
             OR name LIKE '%Thread%' OR name LIKE '%Async%')
        AND kind IN ('function', 'method', 'class')
    `
      )
      .all() as any[];

    for (const api of threadingAPIs) {
      this.addSemanticTag(api.id, "threading_api");

      // Detect thread safety patterns
      if (api.signature?.includes("mutex") || api.signature?.includes("lock")) {
        this.addSemanticTag(api.id, "thread_safe");
      }

      if (api.signature?.includes("atomic")) {
        this.addSemanticTag(api.id, "atomic_operation");
      }
    }
  }

  /**
   * Check if two symbols are related through call relationships
   */
  private isRelatedThroughCalls(fromId: number, toId: number): boolean {
    const relationship = this.db
      .prepare(
        `
      SELECT 1 FROM universal_relationships 
      WHERE (from_symbol_id = ? AND to_symbol_id = ?) 
         OR (from_symbol_id = ? AND to_symbol_id = ?)
    `
      )
      .get(fromId, toId, toId, fromId);

    return !!relationship;
  }

  /**
   * Add a semantic relationship between symbols
   */
  private addSemanticRelationship(
    fromSymbolId: number,
    toSymbolId: number,
    relationshipType: string,
    confidence: number,
    description: string
  ): void {
    try {
      this.db
        .prepare(
          `
        INSERT OR IGNORE INTO universal_relationships 
        (from_symbol_id, to_symbol_id, type, confidence, source_text, line_number)
        VALUES (?, ?, ?, ?, ?, NULL)
      `
        )
        .run(
          fromSymbolId,
          toSymbolId,
          relationshipType,
          confidence,
          description
        );
    } catch (error) {
      // Ignore duplicates
    }
  }

  /**
   * Add a semantic tag to a symbol
   */
  private addSemanticTag(symbolId: number, tag: string): void {
    try {
      const symbol = this.db
        .prepare("SELECT semantic_tags FROM universal_symbols WHERE id = ?")
        .get(symbolId) as any;
      if (symbol) {
        const currentTags = JSON.parse(symbol.semantic_tags || "[]");
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
          this.db
            .prepare(
              "UPDATE universal_symbols SET semantic_tags = ? WHERE id = ?"
            )
            .run(JSON.stringify(currentTags), symbolId);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Get API usage statistics
   */
  async getAPIUsageStats(): Promise<any> {
    const stats = this.db
      .prepare(
        `
      SELECT 
        semantic_tags,
        COUNT(*) as usage_count
      FROM universal_symbols 
      WHERE semantic_tags LIKE '%api_%' 
         OR semantic_tags LIKE '%vulkan_%'
         OR semantic_tags LIKE '%stl_%'
      GROUP BY semantic_tags
      ORDER BY usage_count DESC
    `
      )
      .all();

    return stats;
  }

  close(): void {
    this.db.close();
  }
}

// CLI usage
if (require.main === module) {
  const dbPath = process.argv[2] || "module-sentinel.db";

  const tracker = new APIUsageTracker(dbPath);
  tracker
    .trackAllAPIUsage()
    .then(async () => {
      const stats = await tracker.getAPIUsageStats();
      console.log("\n📊 API Usage Statistics:");
      stats.forEach((stat: any) => {});

      tracker.close();
      console.log("✅ API usage tracking complete!");
    })
    .catch((error) => {
      console.error("❌ API tracking failed:", error);
      tracker.close();
      process.exit(1);
    });
}
