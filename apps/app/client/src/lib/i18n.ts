import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from '../locales/en.json';
import esTranslations from '../locales/es.json';
import frTranslations from '../locales/fr.json';
import deTranslations from '../locales/de.json';
import ptTranslations from '../locales/pt.json';
import zhTranslations from '../locales/zh.json';
import plTranslations from '../locales/pl.json';
import ruTranslations from '../locales/ru.json';
import ukTranslations from '../locales/uk.json';
import roTranslations from '../locales/ro.json';
import arTranslations from '../locales/ar.json';
import heTranslations from '../locales/he.json';
import yoTranslations from '../locales/yo.json';
import pcmTranslations from '../locales/pcm.json';
import okrTranslations from '../locales/okr.json';
import igTranslations from '../locales/ig.json';
import haTranslations from '../locales/ha.json';
import swTranslations from '../locales/sw.json';
import afTranslations from '../locales/af.json';
import itTranslations from '../locales/it.json';
import elTranslations from '../locales/el.json';
import nlTranslations from '../locales/nl.json';
import fiTranslations from '../locales/fi.json';
import faTranslations from '../locales/fa.json';
import hiTranslations from '../locales/hi.json';
import urTranslations from '../locales/ur.json';
import psTranslations from '../locales/ps.json';

const resources = {
  en: { translation: enTranslations },
  es: { translation: esTranslations },
  fr: { translation: frTranslations },
  de: { translation: deTranslations },
  pt: { translation: ptTranslations },
  zh: { translation: zhTranslations },
  pl: { translation: plTranslations },
  ru: { translation: ruTranslations },
  uk: { translation: ukTranslations },
  ro: { translation: roTranslations },
  ar: { translation: arTranslations },
  he: { translation: heTranslations },
  yo: { translation: yoTranslations },
  pcm: { translation: pcmTranslations },
  okr: { translation: okrTranslations },
  ig: { translation: igTranslations },
  ha: { translation: haTranslations },
  sw: { translation: swTranslations },
  af: { translation: afTranslations },
  it: { translation: itTranslations },
  el: { translation: elTranslations },
  nl: { translation: nlTranslations },
  fi: { translation: fiTranslations },
  fa: { translation: faTranslations },
  hi: { translation: hiTranslations },
  ur: { translation: urTranslations },
  ps: { translation: psTranslations },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'fr', 'de', 'pt', 'zh', 'pl', 'ru', 'uk', 'ro', 'ar', 'he', 'yo', 'pcm', 'okr', 'ig', 'ha', 'sw', 'af', 'it', 'el', 'nl', 'fi', 'fa', 'hi', 'ur', 'ps'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: [],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;

export const languages = [
  { code: 'en', name: 'English', region: 'global' },
  { code: 'es', name: 'Español', region: 'global' },
  { code: 'fr', name: 'Français', region: 'global' },
  { code: 'de', name: 'Deutsch', region: 'global' },
  { code: 'pt', name: 'Português (Brasil)', region: 'global' },
  { code: 'zh', name: '中文', region: 'global' },
  { code: 'pl', name: 'Polski', region: 'global' },
  { code: 'ru', name: 'Русский', region: 'global' },
  { code: 'uk', name: 'Українська', region: 'global' },
  { code: 'ro', name: 'Română', region: 'global' },
  { code: 'ar', name: 'العربية', region: 'global' },
  { code: 'he', name: 'עברית', region: 'global' },
  { code: 'it', name: 'Italiano', region: 'global' },
  { code: 'el', name: 'Ελληνικά', region: 'global' },
  { code: 'nl', name: 'Nederlands', region: 'global' },
  { code: 'fi', name: 'Suomi', region: 'global' },
  { code: 'yo', name: 'Yorùbá', region: 'nigeria' },
  { code: 'pcm', name: 'Naijá (Pidgin)', region: 'nigeria' },
  { code: 'okr', name: 'Okrika', region: 'nigeria' },
  { code: 'ig', name: 'Igbo', region: 'nigeria' },
  { code: 'ha', name: 'Hausa', region: 'nigeria' },
  { code: 'sw', name: 'Kiswahili', region: 'kenya' },
  { code: 'af', name: 'Afrikaans', region: 'southafrica' },
  { code: 'fa', name: 'فارسی', region: 'global' },
  { code: 'hi', name: 'हिन्दी', region: 'global' },
  { code: 'ur', name: 'اردو', region: 'global' },
  { code: 'ps', name: 'پښتو', region: 'global' },
];

export const nigerianLanguages = languages.filter(lang => lang.region === 'nigeria');
export const kenyanLanguages = languages.filter(lang => lang.region === 'kenya');
export const southAfricanLanguages = languages.filter(lang => lang.region === 'southafrica');
export const globalLanguages = languages.filter(lang => lang.region === 'global');
