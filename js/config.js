/**
 * Configuración centralizada para la aplicación.
 * Almacena claves de API, URLs y constantes de negocio.
 */
export const SUPABASE_CONFIG = {
  URL: 'https://xtruedkvobfabctfmyys.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo'
};

/**
 * Configuración para Face-API.js
 */
export const FACE_API_CONFIG = {
  MODEL_URL: '/tpi-pyme_alimenticia/models',
  TINY_FACE_DETECTOR_OPTIONS: {
    inputSize: 320,
    scoreThreshold: 0.5
  },
  MATCH_THRESHOLD: 0.6
};

/**
 * Constantes de negocio.
 */
export const APP_CONSTANTS = {
  USER_LEVELS: {
    EMPLOYEE: 1,
    SUPERVISOR: 3
  }
};
