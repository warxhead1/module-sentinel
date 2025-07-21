#pragma once

#include <cstddef>
#include <cstdint>
#include <cassert>
#include <vector>
#include <mutex>

namespace PlanetGen {
namespace Core {
namespace Memory {

/**
 * A fast, thread-safe memory pool for fixed-size blocks.
 * 
 * This class efficiently manages a pool of memory blocks of a specific size.
 * It is designed for high-performance allocation and deallocation of small,
 * fixed-size objects, such as mesh vertices or terrain chunks.
 * 
 * The pool grows automatically when full, and can be pre-allocated to avoid
 * runtime allocations. It is also thread-safe, allowing concurrent allocation
 * and deallocation from multiple threads.
 */
class MemoryPool {
public:
    /**
     * Creates a new memory pool
     * @param blockSize Size of each memory block in bytes
     * @param initialCapacity Number of blocks to pre-allocate
     * @param growthFactor Factor by which to grow the pool when full
     */
    MemoryPool(size_t blockSize, size_t initialCapacity = 32, float growthFactor = 2.0f);
    
    /**
     * Destructor - implicitly frees the memory pool
     */
    ~MemoryPool() = default;
    
    /**
     * Allocates a single block of memory from the pool
     * @return Pointer to the allocated block, or nullptr if allocation failed
     */
    void* Allocate();
    
    /**
     * Returns a block of memory to the pool
     * @param block Pointer to the block to deallocate
     */
    void Deallocate(void* block);
    
    /**
     * Gets the total capacity of the pool
     * @return Number of blocks the pool can hold
     */
    size_t GetTotalBlocks() const;
    
    /**
     * Gets the number of blocks currently allocated from the pool
     * @return Number of blocks in use
     */
    size_t GetUsedBlocks() const;

    /**
     * Gets the size of each block in the pool
     * @return Size of each block in bytes
     */
    size_t GetBlockSize() const { return m_blockSize; }
    
    /**
     * Ensures the pool has capacity for at least the specified number of blocks
     * @param minCapacity Minimum capacity to ensure
     */
    void Reserve(size_t minCapacity);
    
    /**
     * Disallow copying and moving to prevent double-frees
     */
    MemoryPool(const MemoryPool&) = delete;
    MemoryPool& operator=(const MemoryPool&) = delete;
    MemoryPool(MemoryPool&&) = delete;
    MemoryPool& operator=(MemoryPool&&) = delete;

private:
    // Grows the pool by allocating a new chunk of memory
    bool Grow();
    
    // Constants
    static constexpr size_t m_initialChunkSize = 32;
    
    // Configuration
    const size_t m_blockSize;
    const float m_growthFactor;
    
    // State
    std::vector<std::vector<uint8_t>> m_blocks;  // Raw memory chunks
    void* m_freeList = nullptr;                  // Linked list of free blocks
    size_t m_usedBlocks = 0;                     // Number of blocks in use
    size_t m_blocksPerChunk = m_initialChunkSize; // Blocks per chunk
    mutable std::mutex m_mutex;                  // For thread safety
};

} // namespace Memory
} // namespace Core
} // namespace PlanetGen 
