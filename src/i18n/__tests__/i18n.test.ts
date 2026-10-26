import { CATEGORY_ICONS } from '@/lib/categories';

import { enAU } from '../en-AU';
import { resolveLocale } from '../locale';
import { zhTW } from '../zh-TW';

const keysOf = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keysOf(v as object, `${prefix}${k}.`),
  );

const placeholders = (text: string) => [...new Set([...text.matchAll(/{{(\w+)}}/g)].map((m) => m[1]))].sort();

describe('translations', () => {
  it('have the same keys in both languages', () => {
    expect(keysOf(zhTW).sort()).toEqual(keysOf(enAU).sort());
  });

  it('use the same placeholders in both languages', () => {
    const lookup = (obj: object, path: string) =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as string;
    for (const key of keysOf(enAU)) {
      expect([key, placeholders(lookup(zhTW, key))]).toEqual([key, placeholders(lookup(enAU, key))]);
    }
  });

  it('label every category', () => {
    expect(Object.keys(enAU.category).sort()).toEqual(Object.keys(CATEGORY_ICONS).sort());
  });
});

describe('resolveLocale', () => {
  const device = (languageCode: string, regionCode: string | null, languageScriptCode?: string) => [
    { languageCode, regionCode, languageScriptCode },
  ];

  it('honours a manual choice', () => {
    expect(resolveLocale('zh-TW', device('en', 'AU'))).toBe('zh-TW');
    expect(resolveLocale('en-AU', device('zh', 'TW'))).toBe('en-AU');
  });

  it('matches Traditional Chinese phones', () => {
    expect(resolveLocale('system', device('zh', 'TW'))).toBe('zh-TW');
    expect(resolveLocale('system', device('zh', 'AU', 'Hant'))).toBe('zh-TW');
    expect(resolveLocale('system', device('zh', 'HK'))).toBe('zh-TW');
  });

  it('uses en-AU for every other language', () => {
    expect(resolveLocale('system', device('zh', 'CN'))).toBe('en-AU');
    expect(resolveLocale('system', device('zh', 'TW', 'Hans'))).toBe('en-AU');
    expect(resolveLocale('system', device('ja', 'JP'))).toBe('en-AU');
    expect(resolveLocale('system', [])).toBe('en-AU');
  });
});
