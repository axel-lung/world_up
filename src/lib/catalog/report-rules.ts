// Shared by the report form (browser) and the server: no database here.
export const REPORT_TYPES = ['photo', 'text', 'other'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 1000;
