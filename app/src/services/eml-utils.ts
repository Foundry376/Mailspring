import path from 'path';
import os from 'os';

/**
 * Sanitize a string for use as a filename by replacing filesystem-illegal characters.
 */
function sanitizeForFilesystem(input: string): string {
  // Replace filesystem-illegal characters with underscore
  let sanitized = input.replace(/[\/\?\<\>\\\:\*\|\"]/g, '_');
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  // Remove trailing dots and spaces
  sanitized = sanitized.replace(/[\.\s]+$/, '');
  return sanitized;
}

/**
 * Generate a sanitized .eml filename from message metadata.
 *
 * Format: {5-digit-index} - {subject} - {YYYY-MM-DD}.eml
 *
 * Rules:
 * - Subject limited to 80 characters
 * - Filesystem-illegal characters replaced with underscore
 * - Control characters removed
 * - Trailing dots/spaces removed
 * - Empty subjects become "untitled"
 * - Date in UTC YYYY-MM-DD format
 * - On Windows, filename clamped to 200 characters
 */
export function sanitizeEmlFilename(index: number, subject: string, date: Date): string {
  let subjectPart = (subject || '').trim();
  if (subjectPart.length === 0) {
    subjectPart = 'untitled';
  }
  if (subjectPart.length > 80) {
    subjectPart = subjectPart.substring(0, 80);
  }
  subjectPart = sanitizeForFilesystem(subjectPart);

  const paddedIndex = String(index).padStart(5, '0');

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const datePart = `${year}-${month}-${day}`;

  let filename = `${paddedIndex} - ${subjectPart} - ${datePart}.eml`;

  // On Windows, clamp filename to 200 characters
  if (process.platform === 'win32' && filename.length > 200) {
    filename = filename.substring(0, 196) + '.eml';
  }

  return filename;
}

/**
 * Generate a simple .eml filename from a subject for single-message export.
 */
export function emlFilenameForMessage(subject: string, date?: Date): string {
  let subjectPart = (subject || '').trim();
  if (subjectPart.length === 0) {
    subjectPart = 'untitled';
  }
  if (subjectPart.length > 80) {
    subjectPart = subjectPart.substring(0, 80);
  }
  subjectPart = sanitizeForFilesystem(subjectPart);

  if (date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${subjectPart} - ${year}-${month}-${day}.eml`;
  }

  return `${subjectPart}.eml`;
}

/**
 * Get a temp directory path for EML export operations.
 */
export function emlTempDir(): string {
  return path.join(os.tmpdir(), 'mailspring-eml-export');
}

/**
 * Folder roles that should be excluded from bulk export.
 * These are virtual/system folders that don't have real IMAP backing.
 */
const EXCLUDED_EXPORT_ROLES = new Set(['drafts', 'starred', 'unread']);

/**
 * Check if a folder role is eligible for bulk EML export.
 */
export function canExportFolder(role: string | null): boolean {
  if (!role) {
    return true; // user-created folders are always exportable
  }
  return !EXCLUDED_EXPORT_ROLES.has(role);
}
