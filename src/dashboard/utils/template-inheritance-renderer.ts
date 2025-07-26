/**
 * Template and Inheritance Information Renderer
 * 
 * Specialized rendering utilities for displaying C++ template parameters,
 * inheritance hierarchies, and generic type information in graph visualizations.
 */

import { GraphNode } from '../../shared/types/api';
import * as d3 from 'd3';

export interface TemplateInfo {
  isTemplate: boolean;
  templateParameters?: string[];
  templateConstraints?: string[];
  specializations?: string[];
}

export interface InheritanceInfo {
  baseClasses: Array<{
    name: string;
    accessLevel: 'public' | 'private' | 'protected';
    isVirtual: boolean;
  }>;
  derivedClasses: string[];
  isAbstract: boolean;
  virtualMethods: string[];
}

export class TemplateInheritanceRenderer {
  private static instance: TemplateInheritanceRenderer;

  private constructor() {}

  static getInstance(): TemplateInheritanceRenderer {
    if (!TemplateInheritanceRenderer.instance) {
      TemplateInheritanceRenderer.instance = new TemplateInheritanceRenderer();
    }
    return TemplateInheritanceRenderer.instance;
  }

  /**
   * Add template and inheritance visual indicators to node SVG elements
   */
  public enhanceNodeWithTemplateInfo(
    nodeSelection: d3.Selection<any, GraphNode, any, any>
  ): void {
    // Add template parameter indicators
    nodeSelection
      .filter((d: GraphNode) => this.hasTemplateInfo(d))
      .append('g')
      .attr('class', 'template-indicators')
      .each(function(d: GraphNode) {
        const templateGroup = d3.select(this);
        const templateInfo = TemplateInheritanceRenderer.getInstance().extractTemplateInfo(d);
        
        if (templateInfo.isTemplate) {
          // Add template angle brackets around the node
          templateGroup.append('path')
            .attr('class', 'template-brackets')
            .attr('d', TemplateInheritanceRenderer.getInstance().generateTemplateBrackets())
            .attr('stroke', '#ffd93d')
            .attr('stroke-width', 1.5)
            .attr('fill', 'none')
            .attr('opacity', 0.8);

          // Add template parameter count indicator
          if (templateInfo.templateParameters && templateInfo.templateParameters.length > 0) {
            templateGroup.append('text')
              .attr('class', 'template-param-count')
              .attr('x', 15)
              .attr('y', -15)
              .attr('font-size', '9px')
              .attr('fill', '#ffd93d')
              .attr('font-weight', 'bold')
              .text(`<${templateInfo.templateParameters.length}>`);
          }
        }
      });

    // Add inheritance indicators
    nodeSelection
      .filter((d: GraphNode) => this.hasInheritanceInfo(d))
      .append('g')
      .attr('class', 'inheritance-indicators')
      .each(function(d: GraphNode) {
        const inheritanceGroup = d3.select(this);
        const inheritanceInfo = TemplateInheritanceRenderer.getInstance().extractInheritanceInfo(d);
        
        // Add inheritance arrow for base classes
        if (inheritanceInfo.baseClasses.length > 0) {
          inheritanceGroup.append('path')
            .attr('class', 'inheritance-arrow')
            .attr('d', 'M-8,-20 L0,-12 L8,-20')
            .attr('stroke', '#51cf66')
            .attr('stroke-width', 2)
            .attr('fill', 'none')
            .attr('marker-end', 'url(#inheritance-arrowhead)');
        }

        // Add abstract class indicator
        if (inheritanceInfo.isAbstract) {
          inheritanceGroup.append('text')
            .attr('class', 'abstract-indicator')
            .attr('x', -20)
            .attr('y', -15)
            .attr('font-size', '10px')
            .attr('fill', '#6c5ce7')
            .attr('font-style', 'italic')
            .text('A');
        }

        // Add virtual method indicator
        if (inheritanceInfo.virtualMethods.length > 0) {
          inheritanceGroup.append('circle')
            .attr('class', 'virtual-indicator')
            .attr('cx', 18)
            .attr('cy', -18)
            .attr('r', 4)
            .attr('fill', '#fd79a8')
            .attr('opacity', 0.7);
            
          inheritanceGroup.append('text')
            .attr('x', 18)
            .attr('y', -15)
            .attr('font-size', '7px')
            .attr('fill', 'white')
            .attr('text-anchor', 'middle')
            .attr('font-weight', 'bold')
            .text('V');
        }
      });
  }

  /**
   * Add arrow markers for inheritance relationships
   */
  public addInheritanceMarkers(svg: d3.Selection<any, unknown, null, undefined>): void {
    // Define inheritance arrowhead marker
    const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
    
    defs.append('marker')
      .attr('id', 'inheritance-arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#51cf66')
      .attr('stroke', '#51cf66');

    // Define template constraint markers
    defs.append('marker')
      .attr('id', 'template-constraint')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-3L6,0L0,3Z')
      .attr('fill', '#ffd93d')
      .attr('stroke', '#ffd93d');
  }

  /**
   * Generate template bracket path
   */
  private generateTemplateBrackets(): string {
    const radius = 20; // Node radius approximation
    const offset = 4;
    
    // Create angle bracket paths around the circle
    return `
      M ${-radius - offset}, ${-radius/2} 
      L ${-radius - offset - 3}, 0 
      L ${-radius - offset}, ${radius/2}
      M ${radius + offset}, ${-radius/2} 
      L ${radius + offset + 3}, 0 
      L ${radius + offset}, ${radius/2}
    `;
  }

  /**
   * Extract template information from node
   */
  public extractTemplateInfo(node: GraphNode): TemplateInfo {
    const templateInfo: TemplateInfo = {
      isTemplate: false,
      templateParameters: [],
      templateConstraints: [],
      specializations: []
    };

    // Check language features for template info
    if (node.languageFeatures?.isTemplate) {
      templateInfo.isTemplate = true;
      templateInfo.templateParameters = node.languageFeatures.templateParameters || [];
      templateInfo.templateConstraints = node.languageFeatures.genericConstraints || [];
    }

    // Parse template info from signature
    if (node.signature && node.signature.includes('<') && node.signature.includes('>')) {
      templateInfo.isTemplate = true;
      templateInfo.templateParameters = this.parseTemplateParameters(node.signature);
    }

    // Check semantic tags for template-related concepts
    if (node.semanticTags) {
      const templateTags = node.semanticTags.filter(tag => 
        tag.includes('template') || tag.includes('generic') || tag.includes('parameterized')
      );
      if (templateTags.length > 0) {
        templateInfo.isTemplate = true;
      }
    }

    return templateInfo;
  }

  /**
   * Extract inheritance information from node
   */
  public extractInheritanceInfo(node: GraphNode): InheritanceInfo {
    const inheritanceInfo: InheritanceInfo = {
      baseClasses: [],
      derivedClasses: [],
      isAbstract: false,
      virtualMethods: []
    };

    // Check language features for inheritance info
    if (node.languageFeatures) {
      inheritanceInfo.isAbstract = Boolean(node.languageFeatures.isAbstract);
      inheritanceInfo.virtualMethods = (node.languageFeatures as any).virtualMethods || [];
      // We'll populate this from semantic analysis or other sources
    }

    // Parse inheritance from semantic tags
    if (node.semanticTags) {
      const inheritanceTags = node.semanticTags.filter(tag => 
        tag.includes('inherit') || tag.includes('derive') || tag.includes('base') || tag.includes('abstract')
      );
      
      inheritanceTags.forEach(tag => {
        if (tag.includes('abstract')) {
          inheritanceInfo.isAbstract = true;
        }
        if (tag.includes('virtual')) {
          inheritanceInfo.virtualMethods.push('virtual_method');
        }
      });
    }

    // TODO: Extract from relationship data if available
    // This would require access to the full graph context

    return inheritanceInfo;
  }

  /**
   * Parse template parameters from signature
   */
  private parseTemplateParameters(signature: string): string[] {
    const templateMatch = signature.match(/template\s*<([^>]+)>/);
    if (!templateMatch) {
      // Try C++ style templates
      const cppMatch = signature.match(/<([^>]+)>/);
      if (!cppMatch) return [];
      
      return cppMatch[1]
        .split(',')
        .map(param => param.trim())
        .filter(param => param.length > 0);
    }

    return templateMatch[1]
      .split(',')
      .map(param => param.trim())
      .filter(param => param.length > 0);
  }

  /**
   * Check if node has template information
   */
  private hasTemplateInfo(node: GraphNode): boolean {
    return (
      Boolean(node.languageFeatures?.isTemplate) ||
      Boolean(node.signature && node.signature.includes('<') && node.signature.includes('>')) ||
      Boolean(node.semanticTags && node.semanticTags.some(tag => 
        tag.includes('template') || tag.includes('generic')
      ))
    );
  }

  /**
   * Check if node has inheritance information
   */
  private hasInheritanceInfo(node: GraphNode): boolean {
    return (
      Boolean(node.languageFeatures?.isAbstract) ||
      Boolean(node.languageFeatures?.isVirtual) ||
      (node.semanticTags && node.semanticTags.some(tag => 
        tag.includes('inherit') || tag.includes('derive') || tag.includes('abstract')
      )) ||
      node.type === 'class' || node.type === 'struct'
    );
  }

  /**
   * Generate detailed template tooltip content
   */
  public generateTemplateTooltipContent(templateInfo: TemplateInfo): string {
    if (!templateInfo.isTemplate) return '';

    const sections: string[] = [];

    sections.push(`
      <div style="margin-bottom: 8px;">
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">TEMPLATE INFO</div>
        <div style="color: #ffd93d; font-weight: bold;">🔧 Template Class/Function</div>
      </div>
    `);

    if (templateInfo.templateParameters && templateInfo.templateParameters.length > 0) {
      sections.push(`
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; color: #888;">Parameters:</div>
          <div style="font-family: monospace; font-size: 10px; color: #e0e0e0;">
            ${templateInfo.templateParameters.map(param => 
              `<span style="background: rgba(255, 217, 61, 0.2); padding: 1px 3px; margin: 1px; border-radius: 2px;">${param}</span>`
            ).join('')}
          </div>
        </div>
      `);
    }

    if (templateInfo.templateConstraints && templateInfo.templateConstraints.length > 0) {
      sections.push(`
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; color: #888;">Constraints:</div>
          <div style="font-size: 10px; color: #4ecdc4;">
            ${templateInfo.templateConstraints.join(', ')}
          </div>
        </div>
      `);
    }

    return sections.join('');
  }

  /**
   * Generate detailed inheritance tooltip content
   */
  public generateInheritanceTooltipContent(inheritanceInfo: InheritanceInfo): string {
    const sections: string[] = [];

    if (inheritanceInfo.isAbstract) {
      sections.push(`
        <div style="color: #6c5ce7; margin-bottom: 4px;">
          🔮 <strong>Abstract Class</strong>
        </div>
      `);
    }

    if (inheritanceInfo.baseClasses.length > 0) {
      sections.push(`
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; color: #888;">Base Classes:</div>
          ${inheritanceInfo.baseClasses.map(base => `
            <div style="font-size: 10px; margin-left: 8px;">
              <span style="color: ${this.getAccessLevelColor(base.accessLevel)};">${base.accessLevel}</span>
              ${base.isVirtual ? '<span style="color: #fd79a8;">virtual</span>' : ''}
              <span style="color: #51cf66;">${base.name}</span>
            </div>
          `).join('')}
        </div>
      `);
    }

    if (inheritanceInfo.virtualMethods.length > 0) {
      sections.push(`
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; color: #888;">Virtual Methods:</div>
          <div style="color: #fd79a8; font-size: 10px;">
            ${inheritanceInfo.virtualMethods.length} virtual method(s)
          </div>
        </div>
      `);
    }

    if (inheritanceInfo.derivedClasses.length > 0) {
      sections.push(`
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; color: #888;">Derived Classes:</div>
          <div style="color: #51cf66; font-size: 10px;">
            ${inheritanceInfo.derivedClasses.join(', ')}
          </div>
        </div>
      `);
    }

    return sections.length > 0 ? `
      <div>
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">INHERITANCE</div>
        ${sections.join('')}
      </div>
    ` : '';
  }

  /**
   * Get color for access level
   */
  private getAccessLevelColor(accessLevel: string): string {
    switch (accessLevel) {
      case 'public': return '#51cf66';
      case 'protected': return '#ffd93d';
      case 'private': return '#ff6b6b';
      default: return '#888';
    }
  }
}

// Export singleton instance
export const templateInheritanceRenderer = TemplateInheritanceRenderer.getInstance();