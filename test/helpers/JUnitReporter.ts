import * as fs from 'fs/promises';
import * as path from 'path';

export interface TestResult {
  name: string;
  className: string;
  time: number;
  status: 'passed' | 'failed' | 'skipped';
  error?: {
    message: string;
    stack?: string;
  };
}

export class JUnitReporter {
  private results: TestResult[] = [];
  private startTime: number = Date.now();

  addTestResult(result: TestResult): void {
    this.results.push(result);
  }

  async writeReport(outputPath: string = 'test-results.xml'): Promise<void> {
    const totalTime = (Date.now() - this.startTime) / 1000;
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites name="Module Sentinel Test Suite" tests="${this.results.length}" failures="${failed}" skipped="${skipped}" time="${totalTime}">\n`;
    xml += `  <testsuite name="Module Sentinel" tests="${this.results.length}" failures="${failed}" skipped="${skipped}" time="${totalTime}">\n`;

    for (const result of this.results) {
      xml += `    <testcase classname="${result.className}" name="${result.name}" time="${result.time}">\n`;
      
      if (result.status === 'failed' && result.error) {
        xml += `      <failure message="${this.escapeXml(result.error.message)}">\n`;
        if (result.error.stack) {
          xml += this.escapeXml(result.error.stack);
        }
        xml += '\n      </failure>\n';
      } else if (result.status === 'skipped') {
        xml += '      <skipped/>\n';
      }
      
      xml += '    </testcase>\n';
    }

    xml += '  </testsuite>\n';
    xml += '</testsuites>\n';

    await fs.writeFile(outputPath, xml, 'utf-8');
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}