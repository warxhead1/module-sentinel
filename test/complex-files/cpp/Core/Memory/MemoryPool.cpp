#include "Core/Memory/MemoryPool.h"
#include <stdexcept>

namespace PlanetGen {
namespace Core {
namespace Memory {

MemoryPool::MemoryPool(size_t blockSize, size_t initialCapacity, float growthFactor)
    : m_blockSize(blockSize)
    , m_growthFactor(growthFactor)
{
    assert(blockSize >= sizeof(void*));
    assert(growthFactor > 1.0f);
    assert(initialCapacity > 0);
    Reserve(initialCapacity);
}

void* MemoryPool::Allocate() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_freeList) {
        if (!Grow()) {
            return nullptr;
        }
    }
    void* block = m_freeList;
    m_freeList = *reinterpret_cast<void**>(block);
    ++m_usedBlocks;
    
    return block;
}

void MemoryPool::Deallocate(void* block) {
    if (!block) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(m_mutex);
    *reinterpret_cast<void**>(block) = m_freeList;
    m_freeList = block;
    --m_usedBlocks;
}

size_t MemoryPool::GetTotalBlocks() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_blocks.size() * m_blocksPerChunk;
}

size_t MemoryPool::GetUsedBlocks() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_usedBlocks;
}

void MemoryPool::Reserve(size_t minCapacity) {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    while (GetTotalBlocks() < minCapacity) {
        if (!Grow()) {
            break;
        }
    }
}

bool MemoryPool::Grow() {
    const size_t newChunkSize = m_blocks.empty() 
        ? m_initialChunkSize 
        : static_cast<size_t>(m_blocks.back().size() * m_growthFactor);
    std::vector<uint8_t> newChunk(newChunkSize * m_blockSize);
    if (newChunk.empty()) {
        return false;
    }
    for (size_t i = 0; i < newChunkSize; ++i) {
        void* const block = &newChunk[i * m_blockSize];
        *reinterpret_cast<void**>(block) = m_freeList;
        m_freeList = block;
    }
    m_blocks.push_back(std::move(newChunk));
    m_blocksPerChunk = newChunkSize;
    
    return true;
}

} // namespace Memory
} // namespace Core
} // namespace PlanetGen 
