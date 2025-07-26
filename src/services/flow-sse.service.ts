/**
 * Server-Sent Events service for real-time flow updates
 * Provides streaming data for liquid flow visualization
 * Zero-dependency implementation using built-in Node.js
 */

import { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/logger';
import { FlowAnalysisService } from './flow-analysis.service';
import { 
  type FlowUpdate, 
  FlowUpdateType, 
  type SystemFlowMetrics,
  type FlowAlert
} from '../types/flow-types';

const logger = createLogger('FlowSSEService');

interface SSEClient {
  id: string;
  response: ServerResponse;
  lastEventId: number;
}

export class FlowSSEService {
  private flowService: FlowAnalysisService;
  private clients: Map<string, SSEClient> = new Map();
  private updateInterval?: NodeJS.Timeout;
  private eventCounter = 0;

  constructor(flowService: FlowAnalysisService) {
    this.flowService = flowService;
  }

  /**
   * Initialize SSE service and start periodic updates
   */
  initialize(): void {
    // Start periodic updates every 2 seconds
    this.updateInterval = setInterval(() => {
      this.broadcastUpdates();
    }, 2000);
    
    logger.info('SSE service initialized');
  }

  /**
   * Handle SSE connection request
   */
  async handleConnection(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Generate client ID
    const clientId = this.generateClientId();
    
    // Create client object
    const client: SSEClient = {
      id: clientId,
      response: res,
      lastEventId: this.eventCounter
    };

    // Add to clients map
    this.clients.set(clientId, client);
    logger.info('New SSE connection', { clientId });

    // Send initial data
    await this.sendInitialData(client);

    // Handle client disconnect
    req.on('close', () => {
      logger.info('SSE client disconnected', { clientId });
      this.clients.delete(clientId);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      if (res.writable) {
        res.write(':heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 30000); // Every 30 seconds

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  /**
   * Send initial data to new client
   */
  private async sendInitialData(client: SSEClient): Promise<void> {
    try {
      // Send current system metrics
      const metrics = await this.flowService.calculateSystemMetrics();
      
      const update: FlowUpdate = {
        timestamp: new Date().toISOString(),
        type: FlowUpdateType.MetricsUpdate,
        metrics
      };

      this.sendToClient(client, update);

      // Send current relationships
      const relationships = await this.flowService.getFlowRelationships();
      
      const relationshipUpdate: FlowUpdate = {
        timestamp: new Date().toISOString(),
        type: FlowUpdateType.RelationshipChange,
        relationships: relationships.slice(0, 100) // Limit initial data
      };

      this.sendToClient(client, relationshipUpdate);
    } catch (error) {
      logger.error('Failed to send initial data', error);
    }
  }

  /**
   * Broadcast updates to all connected clients
   */
  private async broadcastUpdates(): Promise<void> {
    if (this.clients.size === 0) return;

    try {
      // Get current metrics
      const metrics = await this.flowService.calculateSystemMetrics();
      
      // Check for alerts
      const alerts = this.checkForAlerts(metrics);
      
      // Create metrics update
      const update: FlowUpdate = {
        timestamp: new Date().toISOString(),
        type: FlowUpdateType.MetricsUpdate,
        metrics: {
          systemPressure: metrics.systemPressure,
          flowEfficiency: metrics.flowEfficiency,
          averageLatency: metrics.averageLatency,
          errorRate: metrics.errorRate,
          cpuUtilization: metrics.cpuUtilization,
          memoryPressure: metrics.memoryPressure
        }
      };

      // Broadcast to all clients
      this.broadcast(update);

      // Send alerts if any
      alerts.forEach(alert => {
        const alertUpdate: FlowUpdate = {
          timestamp: new Date().toISOString(),
          type: FlowUpdateType.PerformanceAlert,
          alert
        };
        this.broadcast(alertUpdate);
      });

      // Detect and send bottleneck updates
      if (metrics.bottlenecks.length > 0) {
        const bottleneckUpdate: FlowUpdate = {
          timestamp: new Date().toISOString(),
          type: FlowUpdateType.BottleneckDetected,
          symbolId: metrics.bottlenecks[0].symbolId,
          metrics: {
            bottlenecks: metrics.bottlenecks.slice(0, 5) // Top 5 bottlenecks
          }
        };
        this.broadcast(bottleneckUpdate);
      }

    } catch (error) {
      logger.error('Failed to broadcast updates', error);
    }
  }

  /**
   * Check for system alerts based on metrics
   */
  private checkForAlerts(metrics: SystemFlowMetrics): FlowAlert[] {
    const alerts: FlowAlert[] = [];

    // High system pressure
    if (metrics.systemPressure > 80) {
      alerts.push({
        severity: 'critical',
        message: `System pressure critical: ${metrics.systemPressure.toFixed(1)}%`,
        symbolIds: [],
        timestamp: new Date().toISOString()
      });
    } else if (metrics.systemPressure > 60) {
      alerts.push({
        severity: 'warning',
        message: `System pressure high: ${metrics.systemPressure.toFixed(1)}%`,
        symbolIds: [],
        timestamp: new Date().toISOString()
      });
    }

    // Low flow efficiency
    if (metrics.flowEfficiency < 0.5) {
      alerts.push({
        severity: 'warning',
        message: `Flow efficiency low: ${(metrics.flowEfficiency * 100).toFixed(1)}%`,
        symbolIds: [],
        timestamp: new Date().toISOString()
      });
    }

    // High error rate
    if (metrics.errorRate > 0.1) {
      alerts.push({
        severity: 'error',
        message: `Error rate high: ${(metrics.errorRate * 100).toFixed(1)}%`,
        symbolIds: [],
        timestamp: new Date().toISOString()
      });
    }

    // High memory pressure
    if (metrics.memoryPressure > 75) {
      alerts.push({
        severity: 'warning',
        message: `Memory pressure high: ${metrics.memoryPressure.toFixed(1)}%`,
        symbolIds: [],
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }

  /**
   * Send update to specific client
   */
  private sendToClient(client: SSEClient, update: FlowUpdate): void {
    if (!client.response.writable) return;

    try {
      this.eventCounter++;
      const data = JSON.stringify(update);
      
      // SSE format: id, event, data
      client.response.write(`id: ${this.eventCounter}\n`);
      client.response.write(`event: ${update.type}\n`);
      client.response.write(`data: ${data}\n\n`);
      
      client.lastEventId = this.eventCounter;
    } catch (error) {
      logger.error('Failed to send to client', { clientId: client.id, error });
      this.clients.delete(client.id);
    }
  }

  /**
   * Broadcast update to all clients
   */
  private broadcast(update: FlowUpdate): void {
    const deadClients: string[] = [];

    this.clients.forEach((client) => {
      try {
        this.sendToClient(client, update);
      } catch (error) {
        // Client connection failed, mark for cleanup
        logger.debug('Failed to send to client', { clientId: client.id, error });
        deadClients.push(client.id);
      }
    });

    // Clean up dead clients
    deadClients.forEach(id => this.clients.delete(id));
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown SSE service
   */
  shutdown(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    // Close all client connections
    this.clients.forEach(client => {
      try {
        client.response.end();
      } catch (error) {
        // Ignore errors during shutdown - connection may already be closed
        logger.debug('Error closing client during shutdown', { clientId: client.id, error });
      }
    });

    this.clients.clear();
    logger.info('SSE service shut down');
  }
}