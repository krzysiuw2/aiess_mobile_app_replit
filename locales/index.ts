import en from './en';
import pl from './pl';
import { Language } from '@/types';

export const translations = {
  en,
  pl,
};

export type TranslationKeys = typeof en;

export const getTranslation = (language: Language): TranslationKeys => {
  return translations[language] || translations.en;
};

export const languageOptions = [
  { value: 'en' as Language, label: 'English' },
  { value: 'pl' as Language, label: 'Polski' },
];
