#pragma once

#include "Core/Memory/MemoryPool.h"
#include <type_traits>
#include <new>
#include <cassert>

namespace PlanetGen {
namespace Core {
namespace Memory {

/**
 * A type-safe memory pool that efficiently allocates and deallocates objects of a specific type.
 * Provides automatic construction and destruction of objects.
 * 
 * @tparam T The type of objects to manage
 */
template <typename T>
class ObjectPool {
public:
    /**
     * Creates a new object pool
     * @param initialCapacity Number of objects to pre-allocate
     * @param growthFactor Factor by which to grow the pool when full
     */
    ObjectPool(size_t initialCapacity = 32, float growthFactor = 2.0f)
        : m_memoryPool(sizeof(T), initialCapacity, growthFactor) 
    {
        // Ensure T is not too large or has complex alignment requirements
        static_assert(sizeof(T) >= sizeof(void*), "Type T must be at least the size of a pointer");
        static_assert(std::is_nothrow_destructible<T>::value, 
                     "Type T must have a non-throwing destructor");
    }
    
    /**
     * Destructor - implicitly destroys the memory pool
     */
    ~ObjectPool() = default;
    
    /**
     * Creates a new object in the pool using default constructor
     * @return Pointer to the new object, or nullptr if allocation failed
     */
    T* Create() {
        void* memory = m_memoryPool.Allocate();
        if (!memory) {
            return nullptr;
        }
        
        // Construct the object in-place
        return new(memory) T();
    }
    
    /**
     * Creates a new object in the pool using copy constructor
     * @param other Object to copy
     * @return Pointer to the new object, or nullptr if allocation failed
     */
    T* Create(const T& other) {
        void* memory = m_memoryPool.Allocate();
        if (!memory) {
            return nullptr;
        }
        
        // Construct the object in-place with copy constructor
        return new(memory) T(other);
    }
    
    /**
     * Creates a new object in the pool using constructor arguments
     * @param args Arguments to forward to the constructor
     * @return Pointer to the new object, or nullptr if allocation failed
     */
    template <typename... Args>
    T* Create(Args&&... args) {
        void* memory = m_memoryPool.Allocate();
        if (!memory) {
            return nullptr;
        }
        
        // Construct the object in-place with the provided arguments
        return new(memory) T(std::forward<Args>(args)...);
    }
    
    /**
     * Destroys an object and returns its memory to the pool
     * @param object Pointer to the object to destroy
     */
    void Destroy(T* object) {
        if (object) {
            // Call the destructor manually
            object->~T();
            
            // Return memory to pool
            m_memoryPool.Deallocate(object);
        }
    }
    
    /**
     * Gets the total capacity of the pool
     * @return Number of objects the pool can hold
     */
    size_t GetCapacity() const {
        return m_memoryPool.GetTotalBlocks();
    }
    
    /**
     * Gets the number of objects currently allocated from the pool
     * @return Number of objects in use
     */
    size_t GetAllocatedCount() const {
        return m_memoryPool.GetUsedBlocks();
    }
    
    /**
     * Ensures the pool has capacity for at least the specified number of objects
     * @param minCapacity Minimum capacity to ensure
     */
    void Reserve(size_t minCapacity) {
        m_memoryPool.Reserve(minCapacity);
    }
    
    /**
     * Disallow copying and moving to prevent double-frees
     */
    ObjectPool(const ObjectPool&) = delete;
    ObjectPool& operator=(const ObjectPool&) = delete;
    ObjectPool(ObjectPool&&) = delete;
    ObjectPool& operator=(ObjectPool&&) = delete;

private:
    MemoryPool m_memoryPool;
};

} // namespace Memory
} // namespace Core
} // namespace PlanetGen 
