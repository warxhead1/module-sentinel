/**
 * Path utilities for consistent file path handling across the codebase
 */

/**
 * Extract filename from a full path
 * @param filePath Full file path
 * @returns Just the filename without directory
 */
export function getFileName(filePath: string): string {
  if (!filePath) return '';
  // Handle both forward and backward slashes
  return filePath.split(/[/\\]/).pop() || filePath;
}

/**
 * Get a display-friendly name for a file
 * @param filePath Full file path
 * @param maxLength Optional max length for truncation
 * @returns Display name
 */
export function getFileDisplayName(filePath: string, maxLength?: number): string {
  const fileName = getFileName(filePath);
  if (maxLength && fileName.length > maxLength) {
    return fileName.substring(0, maxLength - 3) + '...';
  }
  return fileName;
}

/**
 * Extract directory from a full path
 * @param filePath Full file path
 * @returns Directory path without filename
 */
export function getDirectory(filePath: string): string {
  if (!filePath) return '';
  const parts = filePath.split(/[/\\]/);
  parts.pop(); // Remove filename
  return parts.join('/');
}

/**
 * Get file extension
 * @param filePath Full file path or filename
 * @returns File extension with dot (e.g., '.ts')
 */
export function getFileExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.substring(lastDot) : '';
}