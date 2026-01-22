import React from 'react';
import { useTranslation } from 'react-i18next';

export function LanguageSelector() {
    const { t, i18n } = useTranslation();

    const languages = [
        { code: 'pt', label: 'Português', flag: '🇵🇹' },
        { code: 'en', label: 'English', flag: '🇬🇧' },
        { code: 'es', label: 'Español', flag: '🇪🇸' },
        { code: 'it', label: 'Italiano', flag: '🇮🇹' },
    ];

    return (
        <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-[var(--accent-primary)] uppercase tracking-wider text-[10px]">
                {t('config.language')}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {languages.map((lang) => (
                    <button
                        key={lang.code}
                        onClick={() => i18n.changeLanguage(lang.code)}
                        className={`
                            flex items-center gap-3 p-3 rounded-xl border transition-all duration-200
                            ${i18n.language.startsWith(lang.code)
                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/20 shadow-sm'
                                : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--surface-hover)]'}
                        `}
                    >
                        <span className="text-2xl filter drop-shadow-sm">{lang.flag}</span>
                        <div className="flex flex-col items-start">
                            <span className={`text-sm font-semibold ${i18n.language.startsWith(lang.code) ? 'text-[var(--accent-primary)]' : 'text-[var(--text-main)]'}`}>
                                {lang.code.toUpperCase()}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">{lang.label}</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
