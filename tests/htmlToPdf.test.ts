import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/utils/escapeHtml.js';
import { wrapReportHtml } from '../src/utils/htmlReportTemplate.js';

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

describe('wrapReportHtml', () => {
  it('escapes title/companyName/subtitle but passes bodyHtml through as-is', () => {
    const html = wrapReportHtml({
      title: 'Отчёт <тест>',
      companyName: 'ООО "Ромашка"',
      subtitle: '2026',
      bodyHtml: '<table><tr><td>Row</td></tr></table>',
    });

    expect(html).toContain('Отчёт &lt;тест&gt;');
    expect(html).toContain('ООО &quot;Ромашка&quot;');
    expect(html).toContain('<table><tr><td>Row</td></tr></table>');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('omits the subtitle separator when no subtitle is given', () => {
    const html = wrapReportHtml({
      title: 'Отчёт',
      companyName: 'Компания',
      bodyHtml: '<p>Body</p>',
    });

    expect(html).not.toContain('&mdash;');
  });
});
