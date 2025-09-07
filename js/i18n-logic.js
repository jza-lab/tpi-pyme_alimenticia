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

export const updateUI = () => {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = getTranslation(key);

    // No sobreescribir el contenido de botones que son solo íconos (como el menú hamburguesa y el de cierre)
    const isIconButton = element.tagName === 'BUTTON' && (element.classList.contains('hamburger') || element.id === 'mobile-sidebar-close');

    if (!isIconButton) {
      // Para la mayoría de los elementos, el textContent es suficiente.
      element.textContent = translation;
    }

    // Siempre actualizar aria-label si existe, para accesibilidad.
    if (element.hasAttribute('aria-label')) {
      element.setAttribute('aria-label', translation);
    }
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
