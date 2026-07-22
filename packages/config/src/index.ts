// Shared runtime constants.

export const SESSION_COOKIE = "mep_session";
export const API_VERSION_PREFIX = "v1";

export const MAX_UPLOAD_BYTES_DEFAULT = 10 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
] as const;

export const BLOCKED_UPLOAD_EXTENSIONS = [
  "exe",
  "bat",
  "cmd",
  "sh",
  "msi",
  "dll",
  "js",
  "mjs",
  "php",
  "py",
  "rb",
  "com",
  "scr",
] as const;

export const PRODUCT_NAME = "My Event Planner";
