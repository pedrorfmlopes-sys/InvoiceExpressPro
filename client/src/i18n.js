import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import pt from './locales/pt/translation.json';
import en from './locales/en/translation.json';
import es from './locales/es/translation.json';
import it from './locales/it/translation.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            pt: { translation: pt },
            en: { translation: en },
            es: { translation: es },
            it: { translation: it },
            'pt-PT': { translation: pt }, // map specific to generic
            'pt-BR': { translation: pt },
            'en-US': { translation: en },
            'en-GB': { translation: en }
        },
        fallbackLng: 'pt',
        debug: false,
        interpolation: {
            escapeValue: false,
        }
    });

export default i18n;
