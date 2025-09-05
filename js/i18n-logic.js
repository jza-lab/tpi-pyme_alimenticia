import { translations } from './i18n.js';

let currentLanguage = 'es';

const getTranslation = (key, lang = currentLanguage) => {
  return translations[lang][key] || key;
};

export const t = (key, replacements = {}) => {
  let translation = getTranslation(key);
  Object.keys(replacements).forEach(placeholder => {
    translation = translation.replace(`{{${placeholder}}}`, replacements[placeholder]);
  });
  return translation;
};

export const setLanguage = (lang) => {
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  updateUI();
  updateToggle(lang);
};

const updateUI = () => {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = getTranslation(key);
  });
};

const updateToggle = (lang) => {
  const toggle = document.getElementById('language-toggle');
  if (toggle) {
    toggle.checked = lang === 'en';
  }
};

const init = () => {
  const savedLanguage = localStorage.getItem('language') || 'es';
  setLanguage(savedLanguage);

  const toggle = document.getElementById('language-toggle');
  if (toggle) {
    toggle.addEventListener('change', (event) => {
      setLanguage(event.target.checked ? 'en' : 'es');
    });
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
