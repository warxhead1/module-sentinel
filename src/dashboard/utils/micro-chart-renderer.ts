/**
 * MicroChartRenderer - Lightweight chart renderer for sparklines and mini visualizations
 * Optimized for small inline charts within dashboard cards
 */

export interface SparklineOptions {
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  showDots?: boolean;
  showArea?: boolean;
  strokeWidth?: number;
  smooth?: boolean;
}

export interface PieChartOptions {
  size?: number;
  colors?: string[];
  showLabels?: boolean;
  donut?: boolean;
  innerRadius?: number;
}

export interface BarChartOptions {
  width?: number;
  height?: number;
  color?: string;
  colors?: string[];
  horizontal?: boolean;
  gap?: number;
  showValues?: boolean;
}

export interface TrendIndicatorOptions {
  value: number;
  previousValue: number;
  format?: 'percent' | 'number';
  showArrow?: boolean;
  precision?: number;
}

export class MicroChartRenderer {
  /**
   * Render a sparkline chart
   */
  static renderSparkline(
    data: number[],
    options: SparklineOptions = {}
  ): SVGSVGElement {
    const width = options.width || 100;
    const height = options.height || 30;
    const color = options.color || '#ba55d3';
    const fillColor = options.fillColor || 'rgba(186, 85, 211, 0.2)';
    const strokeWidth = options.strokeWidth || 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';

    if (data.length < 2) return svg;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = strokeWidth / 2;
    const chartHeight = height - strokeWidth;
    const chartWidth = width - strokeWidth;

    // Create points
    const points: Array<[number, number]> = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - min) / range) * chartHeight;
      return [x, y];
    });

    // Create path
    const pathData = options.smooth 
      ? this.createSmoothPath(points)
      : this.createLinearPath(points);

    // Render area if enabled
    if (options.showArea) {
      const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const areaData = pathData + ` L${width - padding},${height - padding} L${padding},${height - padding} Z`;
      areaPath.setAttribute('d', areaData);
      areaPath.setAttribute('fill', fillColor);
      areaPath.setAttribute('stroke', 'none');
      svg.appendChild(areaPath);
    }

    // Render line
    const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    linePath.setAttribute('d', pathData);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', color);
    linePath.setAttribute('stroke-width', strokeWidth.toString());
    linePath.setAttribute('stroke-linecap', 'round');
    linePath.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(linePath);

    // Render dots if enabled
    if (options.showDots) {
      points.forEach(([x, y], index) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x.toString());
        circle.setAttribute('cy', y.toString());
        circle.setAttribute('r', '2');
        circle.setAttribute('fill', color);
        
        // Highlight last point
        if (index === points.length - 1) {
          circle.setAttribute('r', '3');
          circle.setAttribute('fill', '#fff');
          circle.setAttribute('stroke', color);
          circle.setAttribute('stroke-width', '2');
        }
        
        svg.appendChild(circle);
      });
    }

    return svg;
  }

  /**
   * Render a mini pie chart
   */
  static renderPieChart(
    data: Array<{ value: number; label?: string }>,
    options: PieChartOptions = {}
  ): SVGSVGElement {
    const size = options.size || 40;
    const colors = options.colors || ['#ba55d3', '#9370db', '#8b008b', '#4b0082', '#6a0dad'];
    const isDonut = options.donut || false;
    const innerRadius = options.innerRadius || size * 0.4;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size.toString());
    svg.setAttribute('height', size.toString());
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';

    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return svg;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size / 2) - 2;

    let currentAngle = -Math.PI / 2; // Start from top

    data.forEach((item, index) => {
      const percentage = item.value / total;
      const angle = percentage * Math.PI * 2;
      const endAngle = currentAngle + angle;

      // Create path for slice
      const path = this.createPieSlice(
        centerX,
        centerY,
        radius,
        isDonut ? innerRadius : 0,
        currentAngle,
        endAngle
      );

      const slice = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      slice.setAttribute('d', path);
      slice.setAttribute('fill', colors[index % colors.length]);
      slice.setAttribute('stroke', 'rgba(0, 0, 0, 0.2)');
      slice.setAttribute('stroke-width', '0.5');
      
      if (item.label) {
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${item.label}: ${item.value} (${(percentage * 100).toFixed(1)}%)`;
        slice.appendChild(title);
      }

      svg.appendChild(slice);
      currentAngle = endAngle;
    });

    return svg;
  }

  /**
   * Render a mini bar chart
   */
  static renderBarChart(
    data: number[],
    options: BarChartOptions = {}
  ): SVGSVGElement {
    const width = options.width || 60;
    const height = options.height || 30;
    const color = options.color || '#ba55d3';
    const gap = options.gap || 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';

    if (data.length === 0) return svg;

    const max = Math.max(...data);
    const barWidth = (width - gap * (data.length - 1)) / data.length;

    data.forEach((value, index) => {
      const barHeight = (value / max) * height;
      const x = index * (barWidth + gap);
      const y = height - barHeight;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x.toString());
      rect.setAttribute('y', y.toString());
      rect.setAttribute('width', barWidth.toString());
      rect.setAttribute('height', barHeight.toString());
      rect.setAttribute('fill', options.colors ? options.colors[index % options.colors.length] : color);
      rect.setAttribute('rx', '2');
      
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = value.toString();
      rect.appendChild(title);

      svg.appendChild(rect);
    });

    return svg;
  }

  /**
   * Render a trend indicator with percentage/value change
   */
  static renderTrendIndicator(options: TrendIndicatorOptions): HTMLElement {
    const container = document.createElement('span');
    container.className = 'trend-indicator';
    
    const change = options.value - options.previousValue;
    const percentChange = options.previousValue !== 0 
      ? (change / options.previousValue) * 100 
      : 0;
    
    const isPositive = change > 0;
    const isNegative = change < 0;
    
    container.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      font-weight: 600;
      color: ${isPositive ? '#4ade80' : isNegative ? '#f87171' : '#94a3b8'};
    `;

    if (options.showArrow !== false) {
      const arrow = document.createElement('span');
      arrow.textContent = isPositive ? '↑' : isNegative ? '↓' : '→';
      arrow.style.fontSize = '16px';
      container.appendChild(arrow);
    }

    const value = document.createElement('span');
    if (options.format === 'percent') {
      value.textContent = `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(options.precision || 1)}%`;
    } else {
      value.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(options.precision || 0)}`;
    }
    container.appendChild(value);

    return container;
  }

  /**
   * Create a linear path from points
   */
  private static createLinearPath(points: Array<[number, number]>): string {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`)
      .join(' ');
  }

  /**
   * Create a smooth curved path from points
   */
  private static createSmoothPath(points: Array<[number, number]>): string {
    if (points.length < 2) return '';
    
    let path = `M ${points[0][0]} ${points[0][1]}`;
    
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      
      if (i === 1) {
        path += ` Q ${x0} ${y0}, ${mx} ${my}`;
      } else if (i === points.length - 1) {
        path += ` Q ${x1} ${y1}, ${x1} ${y1}`;
      } else {
        path += ` Q ${x0} ${y0}, ${mx} ${my}`;
      }
    }
    
    return path;
  }

  /**
   * Create a pie slice path
   */
  private static createPieSlice(
    cx: number,
    cy: number,
    outerRadius: number,
    innerRadius: number,
    startAngle: number,
    endAngle: number
  ): string {
    const x1 = cx + outerRadius * Math.cos(startAngle);
    const y1 = cy + outerRadius * Math.sin(startAngle);
    const x2 = cx + outerRadius * Math.cos(endAngle);
    const y2 = cy + outerRadius * Math.sin(endAngle);
    
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    
    if (innerRadius > 0) {
      const ix1 = cx + innerRadius * Math.cos(startAngle);
      const iy1 = cy + innerRadius * Math.sin(startAngle);
      const ix2 = cx + innerRadius * Math.cos(endAngle);
      const iy2 = cy + innerRadius * Math.sin(endAngle);
      
      return `
        M ${x1} ${y1}
        A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}
        L ${ix2} ${iy2}
        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}
        Z
      `;
    }
    
    return `
      M ${cx} ${cy}
      L ${x1} ${y1}
      A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}
      Z
    `;
  }

  /**
   * Generate sample data for testing
   */
  static generateSampleData(length: number, min: number = 0, max: number = 100): number[] {
    return Array.from({ length }, () => 
      Math.floor(Math.random() * (max - min + 1)) + min
    );
  }
}