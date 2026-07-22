import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/utils/escapeHtml.js';
import {
  wrapReportHtml,
  buildReportHeaderTemplate,
  buildReportFooterTemplate,
  buildSignaturesBlock,
} from '../src/utils/htmlReportTemplate.js';
import { REPORT_DICTIONARIES } from '../src/i18n/reportDictionary.js';
import { REPORT_LANGUAGE_VALUES } from '../src/i18n/reportLanguage.js';

const ru = REPORT_DICTIONARIES.ru;
const en = REPORT_DICTIONARIES.en;

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<script>alert('x')</script> & "quotes"`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quotes&quot;',
    );
  });

  it('leaves plain text, including Cyrillic, untouched', () => {
    expect(escapeHtml('Кофе Arabica 1kg')).toBe('Кофе Arabica 1kg');
  });
});

describe('REPORT_DICTIONARIES', () => {
  it('has a complete dictionary for all three report languages', () => {
    for (const lang of REPORT_LANGUAGE_VALUES) {
      expect(REPORT_DICTIONARIES[lang]).toBeDefined();
      expect(REPORT_DICTIONARIES[lang].purchasesTitle.length).toBeGreaterThan(0);
    }
  });

  it('gives each language its own distinct report titles (not silently falling back to Russian)', () => {
    const titles = REPORT_LANGUAGE_VALUES.map((lang) => REPORT_DICTIONARIES[lang].purchasesTitle);
    expect(new Set(titles).size).toBe(REPORT_LANGUAGE_VALUES.length);
  });

  it('formats the signature date placeholder per language', () => {
    expect(ru.sigDatePlaceholder(2026)).toContain('2026');
    expect(en.sigDatePlaceholder(2026)).toContain('2026');
  });
});

describe('wrapReportHtml', () => {
  it('escapes title/periodStr/generatedStr but passes bodyHtml through as-is', () => {
    const html = wrapReportHtml({
      lang: 'ru',
      dict: ru,
      title: 'Отчёт <тест>',
      periodStr: '01.01.2026 — 31.01.2026',
      generatedStr: '20.01.2026',
      bodyHtml: '<table><tr><td>Row</td></tr></table>',
    });

    expect(html).toContain('Отчёт &lt;тест&gt;');
    expect(html).toContain('<table><tr><td>Row</td></tr></table>');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="ru">');
  });

  it('uses the English dictionary\'s period/generated labels when lang is en', () => {
    const html = wrapReportHtml({
      lang: 'en',
      dict: en,
      title: 'Purchases Report',
      periodStr: 'all time',
      generatedStr: '01/20/2026',
      bodyHtml: '<p>Body</p>',
    });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain(en.periodLabel);
    expect(html).toContain(en.generatedLabel);
  });

  it('embeds the DejaVu Sans @font-face so Cyrillic renders regardless of container system fonts', () => {
    const html = wrapReportHtml({
      lang: 'ru',
      dict: ru,
      title: 'Отчёт',
      periodStr: ru.allTime,
      generatedStr: '20.01.2026',
      bodyHtml: '<p>Body</p>',
    });

    expect(html).toContain('@font-face');
    expect(html).toContain("font-family: 'DejaVu Sans'");
  });
});

describe('buildReportHeaderTemplate', () => {
  it('escapes tenantName/title/periodStr and includes the logo mark + font-face', () => {
    const html = buildReportHeaderTemplate({
      tenantName: 'ООО "Ромашка" <script>',
      title: 'Отчёт по закупкам',
      periodStr: '01.01.2026 — 31.01.2026',
    });

    expect(html).toContain('ООО &quot;Ромашка&quot; &lt;script&gt;');
    expect(html).toContain('Отчёт по закупкам');
    expect(html).toContain('<svg');
    expect(html).toContain('@font-face');
  });
});

describe('buildReportFooterTemplate', () => {
  it('escapes generatedStr and includes the localized generated label + Axis Digital attribution', () => {
    const html = buildReportFooterTemplate({ generatedStr: '20.01.2026 <x>', dict: ru });

    expect(html).toContain('20.01.2026 &lt;x&gt;');
    expect(html).toContain(ru.generatedLabel);
    expect(html).toContain('Axis Digital');
  });

  it('uses the English generated label when given the English dictionary', () => {
    const html = buildReportFooterTemplate({ generatedStr: '01/20/2026', dict: en });

    expect(html).toContain(en.generatedLabel);
  });
});

describe('buildSignaturesBlock', () => {
  it('includes all three sign-off columns in Russian', () => {
    const html = buildSignaturesBlock(ru);

    expect(html).toContain(ru.sigResponsible);
    expect(html).toContain(ru.sigAccountant);
    expect(html).toContain(ru.sigDate);
  });

  it('includes all three sign-off columns in English', () => {
    const html = buildSignaturesBlock(en);

    expect(html).toContain(en.sigResponsible);
    expect(html).toContain(en.sigAccountant);
    expect(html).toContain(en.sigDate);
  });
});
