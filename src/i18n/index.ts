import { createInstance } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { enAU } from './en-AU';
import { langOf, type AppLocale } from './locale';
import { zhTW } from './zh-TW';

export { resolveLocale, type AppLocale } from './locale';

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: {
    'en-AU': { translation: enAU },
    'zh-TW': { translation: zhTW },
  },
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setAppLocale(locale: AppLocale) {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
}

/** Translation function plus the UI language ('en' | 'zh') for date and number helpers. */
export function useI18n() {
  const { t, i18n: instance } = useTranslation();
  const locale: AppLocale = instance.language === 'zh-TW' ? 'zh-TW' : 'en-AU';
  return { t, locale, lang: langOf(locale) };
}

export default i18n;
