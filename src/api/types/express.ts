/**
 * Express types - lightweight interface compatible with our current setup
 */

export interface Request {
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body?: any;
  headers: Record<string, string | string[]>;
  method: string;
  url: string;
}

export interface Response {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  write(chunk: string): void;
  end(data?: string): void;
  json(data: any): void;
  status(code: number): Response;
}