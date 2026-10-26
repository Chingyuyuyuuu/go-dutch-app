import type { LocalePref } from '@/lib/domain';
import type { UiLang } from '@/lib/date';

export type AppLocale = 'zh-TW' | 'en-AU';

export type DeviceLocale = {
  languageCode: string | null;
  regionCode: string | null;
  languageScriptCode?: string | null;
};

const TRADITIONAL_REGIONS = ['TW', 'HK', 'MO'];

/**
 * "Match my phone": Traditional Chinese phones get zh-TW; every other language
 * (including Simplified Chinese) gets en-AU, as the spec says.
 */
export function resolveLocale(pref: LocalePref, device: DeviceLocale[]): AppLocale {
  if (pref !== 'system') return pref;
  const first = device[0];
  if (!first || first.languageCode !== 'zh') return 'en-AU';
  if (first.languageScriptCode === 'Hant') return 'zh-TW';
  if (first.languageScriptCode === 'Hans') return 'en-AU';
  return first.regionCode && TRADITIONAL_REGIONS.includes(first.regionCode) ? 'zh-TW' : 'en-AU';
}

export function langOf(locale: AppLocale): UiLang {
  return locale === 'zh-TW' ? 'zh' : 'en';
}
