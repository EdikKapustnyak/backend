export const REPORT_LANGUAGE_VALUES = ['ru', 'en', 'no'] as const;
export type ReportLanguage = (typeof REPORT_LANGUAGE_VALUES)[number];

export const REPORT_LANGUAGES: ReportLanguage[] = [...REPORT_LANGUAGE_VALUES];

/** Intl/toLocaleString locale codes per report language - used for date and number formatting throughout the PDF reports. */
export const REPORT_LOCALE: Record<ReportLanguage, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  no: 'nb-NO',
};
