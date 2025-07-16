module;

#include <vulkan/vulkan.h>
#include <Core/Logging/LoggerMacros.h>

module BufferFactory;

import VulkanUniformManager;
import BufferManagement;
import Core.Logging.Logger;

namespace PlanetGen::Rendering {

bool BufferFactory::CreateStandardUniformBuffer(
    VulkanUniformManager& uniformManager,
    const std::string& name,
    size_t size,
    bool tripleBuffered) {
    
    try {
        if (tripleBuffered) {
            return uniformManager.CreateDynamicUniformBuffer(name, size);
        } else {
            return uniformManager.CreateUniformBuffer(name, size);
        }
    } catch (const std::exception& e) {
        LOG_ERROR("BufferFactory", "Failed to create uniform buffer {}: {}", name, e.what());
        return false;
    }
}

bool BufferFactory::CreateVertexBuffer(
    BufferManagementSystem& bufferManager,
    const std::string& name,
    size_t size,
    const void* data) {
    
    try {
        BufferUsageHints hints;
        hints.gpuReadWrite = false;
        hints.hostVisible = false;
        
        auto buffer = bufferManager.CreateBuffer(
            size,
            VK_BUFFER_USAGE_VERTEX_BUFFER_BIT | VK_BUFFER_USAGE_TRANSFER_DST_BIT,
            BufferCategory::VertexBuffer,
            hints
        );
        
        if (!buffer) {
            LOG_ERROR("BufferFactory", "Failed to create vertex buffer {}", name);
            return false;
        }
        
        // Copy data if provided
        if (data) {
            return bufferManager.CopyToBuffer(buffer, data, size);
        }
        
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("BufferFactory", "Failed to create vertex buffer {}: {}", name, e.what());
        return false;
    }
}

bool BufferFactory::CreateIndexBuffer(
    BufferManagementSystem& bufferManager,
    const std::string& name,
    size_t size,
    const void* data) {
    
    try {
        BufferUsageHints hints;
        hints.gpuReadWrite = false;
        hints.hostVisible = false;
        
        auto buffer = bufferManager.CreateBuffer(
            size,
            VK_BUFFER_USAGE_INDEX_BUFFER_BIT | VK_BUFFER_USAGE_TRANSFER_DST_BIT,
            BufferCategory::IndexBuffer,
            hints
        );
        
        if (!buffer) {
            LOG_ERROR("BufferFactory", "Failed to create index buffer {}", name);
            return false;
        }
        
        // Copy data if provided
        if (data) {
            return bufferManager.CopyToBuffer(buffer, data, size);
        }
        
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("BufferFactory", "Failed to create index buffer {}: {}", name, e.what());
        return false;
    }
}

bool BufferFactory::CreateStorageBuffer(
    BufferManagementSystem& bufferManager,
    const std::string& name,
    size_t size,
    bool hostVisible) {
    
    try {
        BufferUsageHints hints;
        hints.gpuReadWrite = true;
        hints.hostVisible = hostVisible;
        
        auto buffer = bufferManager.CreateBuffer(
            size,
            VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_TRANSFER_DST_BIT,
            BufferCategory::StorageBuffer,
            hints
        );
        
        if (!buffer) {
            LOG_ERROR("BufferFactory", "Failed to create storage buffer {}", name);
            return false;
        }
        
        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("BufferFactory", "Failed to create storage buffer {}: {}", name, e.what());
        return false;
    }
}

std::vector<bool> BufferFactory::CreateBuffers(
    VulkanUniformManager& uniformManager,
    const std::vector<BufferSpec>& specs) {
    
    std::vector<bool> results;
    results.reserve(specs.size());
    
    for (const auto& spec : specs) {
        bool success = CreateStandardUniformBuffer(
            uniformManager, 
            spec.name, 
            spec.size, 
            spec.tripleBuffered
        );
        results.push_back(success);
        
        if (!success) {
            LOG_ERROR("BufferFactory", "Failed to create buffer from spec: {}", spec.name);
        }
    }
    
    return results;
}

} // namespace PlanetGen::Rendering