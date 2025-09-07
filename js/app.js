// Importar todos los módulos necesarios
import { APP_CONSTANTS } from './config.js';
import * as api from './api.js';
import * as face from './face.js';
import * as state from './state.js';
import { t } from './i18n-logic.js';

// ------------------- Utilidades de Caché ------------------- //

/**
 * Fuerza la actualización del service worker y limpia la caché si es necesario
 */
function forceServiceWorkerUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.update();
      });
    });
  }
}

/**
 * Detecta si hay problemas de caché y ofrece limpiarla
 */
function detectAndHandleCacheIssues() {
  // Detectar si hay inconsistencias que sugieran problemas de caché
  const hasInconsistencies = sessionStorage.getItem('auth_cache_issues') === 'true';
  
  if (hasInconsistencies) {
    console.warn('Detectados problemas de caché, forzando actualización...');
    forceServiceWorkerUpdate();
    sessionStorage.removeItem('auth_cache_issues');
  }
}

/**
 * Marcar que hay problemas de caché para el próximo reload
 */
function markCacheIssues() {
  sessionStorage.setItem('auth_cache_issues', 'true');
}

// La pantalla de 'autorización pendiente' y su lógica de sondeo (checkAuthorizationStatus)
// ya no son necesarias en el frontend, ya que el nuevo flujo concede acceso inmediato
// y la autorización se maneja de forma asíncrona en el backend.

// ------------------- DOM Refs ------------------- //
// Cachear referencias a elementos del DOM para mayor eficiencia
const dom = {
  screens: document.querySelectorAll('.screen'),
  loginVideo: document.getElementById('login-video'),
  loginOverlay: document.getElementById('login-overlay'),
  loginStatus: document.getElementById('login-status'),
  welcomeMessage: document.getElementById('welcome-message'),
  denialTitle: document.getElementById('denial-title'),
  denialReason: document.getElementById('denial-reason'),
  supervisorMenuBtn: document.getElementById('supervisor-menu-btn'),
  supervisorMenuBtnDenied: document.getElementById('supervisor-menu-btn-denied'),
  pendingAuth: {
    message: document.getElementById('pending-auth-message'),
    backBtn: document.getElementById('back-to-home-from-pending'),
  },
  manualLogin: {
    container: document.getElementById('manual-login'),
    credentialsForm: document.getElementById('credentials-form'),
    tokenForm: document.getElementById('token-form'),
    tokenInput: document.getElementById('manual-token'),
    tokenTimer: document.getElementById('token-timer'),
    verifyTokenBtn: document.getElementById('verify-token-btn'),
    code: document.getElementById('manual-operator-code'),
    dni: document.getElementById('manual-operator-dni'),
    title: document.querySelector('#manual-login h3'),
    loginBtn: document.getElementById('manual-login-btn'),
    retryBtn: document.getElementById('retry-facial-login-btn')
  }
};

// ------------------- Estado de la App (específico de esta página) ------------------- //
let currentLoginType = 'ingreso';
let isProcessingAccess = false;
let recognitionInterval = null;
let authorizationCheckInterval = null;
let tokenTimerInterval = null;

// ------------------- Gestión de Pantallas ------------------- //
function showScreen(screenId) {
    if (screenId !== 'pending-authorization-screen') {
        if (authorizationCheckInterval) clearInterval(authorizationCheckInterval);
        authorizationCheckInterval = null;
    }

  if (screenId === 'home-screen') {
    sessionStorage.removeItem('isSupervisor');
    sessionStorage.removeItem('supervisorCode'); // Limpiar el legajo también
  }
  dom.screens.forEach(s => s.classList.remove('active'));
  const screenToShow = document.getElementById(screenId);
  if (screenToShow) {
    screenToShow.classList.add('active');
  }

  if (screenId !== 'login-screen') {
    stopFacialRecognition();
    stopVideoStream(dom.loginVideo);
  }
}

// ------------------- Video / Cámara ------------------- //
async function startVideoStream(videoEl) {
  try {
    if (videoEl.srcObject) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    videoEl.srcObject = stream;
    await new Promise(resolve => {
      videoEl.onloadedmetadata = () => {
        videoEl.play();
        resolve();
      };
    });
  } catch (err) {
    console.error('Error al acceder a la cámara:', err);
    throw new Error('No se pudo acceder a la cámara.');
  }
}

function stopVideoStream(videoEl) {
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(track => track.stop());
    videoEl.srcObject = null;
  }
}

// ------------------- Flujo de Reconocimiento Facial ------------------- //
async function startFacialLogin(type) {
  // Forzar la actualización del estado al iniciar un nuevo flujo de login
  // para asegurar que los datos del usuario (ej: turno) están actualizados.
  await state.refreshState();
  
  currentLoginType = type;
  if (dom.loginOverlay) {
    const ctx = dom.loginOverlay.getContext('2d');
    ctx.clearRect(0, 0, dom.loginOverlay.width, dom.loginOverlay.height);
  }
  showScreen('login-screen');
  resetManualLoginForm();

  const title = document.getElementById('login-title');
  const desc = document.getElementById('login-description');
  const translatedType = t(type);
  title.textContent = t('register_type', { type: translatedType });
  desc.textContent = t('position_for_scan', { type: translatedType });


  try {
    await startVideoStream(dom.loginVideo);
    runFacialRecognition();
  } catch (error) {
    dom.loginStatus.textContent = t('camera_access_error');
    dom.loginStatus.className = 'status error';
    showManualLoginOption();
  }
}

function runFacialRecognition() {
    dom.loginStatus.textContent = t('searching_for_match');
    dom.loginStatus.className = 'status info';

    let recognitionAttempts = 0;
    const maxAttempts = 15; // Intentar durante ~5 segundos (15 * 300ms)

    if (recognitionInterval) clearInterval(recognitionInterval);
    recognitionInterval = setInterval(async () => {
        if (!dom.loginVideo.srcObject || recognitionAttempts >= maxAttempts) {
            stopFacialRecognition();
            showManualLoginOption();
            return;
        }

        recognitionAttempts++;
        const detection = await face.getSingleFaceDetection(dom.loginVideo);

        if (detection) {
            face.drawDetections(dom.loginVideo, dom.loginOverlay, [detection]);
            const faceMatcher = state.getFaceMatcher();
            if (faceMatcher) {
                const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                if (bestMatch.label !== 'unknown') {
                    const user = state.getUsers().find(u => u.codigo_empleado === bestMatch.label);
                    if (user) {
                        stopFacialRecognition();
                        dom.loginStatus.textContent = t('user_recognized', { name: user.nombre });
                        dom.loginStatus.className = 'status success';
                        grantAccess(user);
                    }
                }
            }
        } else {
            const ctx = dom.loginOverlay.getContext('2d');
            ctx.clearRect(0, 0, dom.loginOverlay.width, dom.loginOverlay.height);
        }
    }, 300);
}

function stopFacialRecognition() {
  if (recognitionInterval) clearInterval(recognitionInterval);
  recognitionInterval = null;
}

// ------------------- Lógica de Autorización de Acceso ------------------- //

// El conteo de intentos de autorización y el bloqueo ahora se manejan
// en el backend de forma persistente a través de la Edge Function
// `request-immediate-access`. Se elimina la lógica de sessionStorage.


// ------------------- Lógica de Turnos y Acceso ------------------- //

/**
 * Determina el turno para una hora específica.
 * @param {number} hour - La hora (0-23).
 * @returns {'Mañana' | 'Tarde' | 'Noche'}
 */
function getShiftForHour(hour) {
  if (hour >= 6 && hour < 14) {
    return 'Mañana';
  } else if (hour >= 14 && hour < 22) {
    return 'Tarde';
  } else {
    return 'Noche';
  }
}

/**
 * Determina el turno actual basado en la hora.
 * @returns {'Mañana' | 'Tarde' | 'Noche'}
 */
function getCurrentShift() {
  return getShiftForHour(new Date().getHours());
}

async function grantAccess(user) {
  if (isProcessingAccess) return;
  isProcessingAccess = true;

  try {
    const currentShift = getCurrentShift();
    const isOutOfShift = (currentLoginType === 'ingreso' && user.turno && user.turno !== currentShift);

    if (isOutOfShift) {
      // --- Lógica para Ingreso Fuera de Turno ---
      // Esta llamada ahora debe tener toda la lógica de autorización en el backend
      const details = {
        turno_correspondiente: user.turno,
        turno_intento: currentShift,
        motivo: t('out_of_shift_attempt')
      };
      await api.requestImmediateAccess(user.codigo_empleado, currentLoginType, details);

    } else {
      // --- Lógica de Acceso Normal (en turno, o cualquier egreso) ---
      // La función 'access' del backend ahora está corregida y maneja todas las validaciones.
      await api.registerAccess(user.codigo_empleado, currentLoginType);
    }

    // --- Flujo de Éxito (común) ---
    await state.refreshState();

    if (isOutOfShift) {
      // Si fue fuera de turno, mostrar la pantalla de aviso especial.
      showScreen('access-pending-review-screen');
    } else {
      // Si fue un acceso normal, mostrar la pantalla de éxito estándar.
      dom.welcomeMessage.textContent = t('access_registered_message', { name: user.nombre, type: currentLoginType });
      
      // --- DEBUGGING ---
      console.log('Verificando acceso al menú para:', { 
        nombre: user.nombre, 
        nivel_acceso: user.nivel_acceso,
        condicion: user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.ANALISTA
      });
      // --- FIN DEBUGGING ---

      if (currentLoginType === 'ingreso' && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.ANALISTA) {
        dom.supervisorMenuBtn.style.display = 'block';
        sessionStorage.setItem('isSupervisor', 'true'); // El nombre de la variable en sessionStorage se mantiene por consistencia
        sessionStorage.setItem('supervisorCode', user.codigo_empleado);
      } else {
        dom.supervisorMenuBtn.style.display = 'none';
      }
      showScreen('access-granted-screen');
    }

  } catch (error) {
    // --- Common Error Handling ---
    console.error(t('grant_access_error'), error);

    let errorMessage = t('unknown_registration_error');
    if (error.context && typeof error.context.json === 'function') {
        try {
            const jsonError = await error.context.json();
            errorMessage = jsonError.error || errorMessage;
        } catch (e) { 
            errorMessage = error.message;
        }
    } else {
        errorMessage = error.message;
    }
    
    denyAccess(errorMessage, user);
  
  } finally {
    isProcessingAccess = false;
  }
}

function denyAccess(reason, user = null) {
  // Reset to default title first
  dom.denialTitle.textContent = t('access_denied_title');
  
  // Handle specific denial reasons
  if (reason.toLowerCase().includes('dentro')) {
    dom.denialTitle.textContent = t('denial_title_entry');
    dom.denialReason.textContent = t('denial_reason_entry', { name: user?.nombre || 'El usuario' });
  } else if (reason.toLowerCase().includes('fuera')) {
    dom.denialTitle.textContent = t('denial_title_exit');
    dom.denialReason.textContent = t('denial_reason_exit', { name: user?.nombre || 'El usuario' });
  } else {
    dom.denialReason.textContent = reason;
  }

  // Handle supervisor/analyst re-entry logic
  dom.supervisorMenuBtnDenied.style.display = 'none';
  const isAnalystOrHigher = user && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.ANALISTA;
  const isAlreadyInsideError = reason.toLowerCase().includes('dentro');
  if (currentLoginType === 'ingreso' && isAnalystOrHigher && isAlreadyInsideError) {
    sessionStorage.setItem('isSupervisor', 'true'); // Keep session variable name for consistency
    sessionStorage.setItem('supervisorCode', user.codigo_empleado);
    dom.supervisorMenuBtnDenied.style.display = 'block';
  }

  showScreen('access-denied-screen');
}


// ------------------- Acceso Manual ------------------- //
async function attemptManualLogin() {
  const code = dom.manualLogin.code.value;
  const dni = dom.manualLogin.dni.value;
  if (!code || !dni) return alert(t('Rellene ambos campos'));

  try {
    await api.sendLoginToken(code, dni);
    
    dom.manualLogin.credentialsForm.style.display = 'none';
    dom.manualLogin.tokenForm.style.display = 'block';
    dom.loginStatus.textContent = t('Token Enviado');
    dom.loginStatus.className = 'status info';
    startTokenTimer(900);

  } catch (error) {
    denyAccess(error.message || t('Credenciales inválidas'));
  }
}

async function verifyToken() {
    const token = dom.manualLogin.tokenInput.value;
    const code = dom.manualLogin.code.value;
    const dni = dom.manualLogin.dni.value;

    if (!token) return alert(t('Ingrese el token recibido'));

    try {
        const { user } = await api.verifyLoginToken(token, code, dni);
        clearInterval(tokenTimerInterval);
        grantAccess(user);
    } catch (error) {
        denyAccess(error.message || t('Token invalido o expirado'));
    }
}

function showManualLoginOption() {
  stopVideoStream(dom.loginVideo); // Detener el stream de la cámara
  const { container, title, loginBtn, retryBtn } = dom.manualLogin;
  dom.loginStatus.textContent = t('recognition_failed_manual_prompt');
  dom.loginStatus.className = 'status error';
  const translatedType = t(currentLoginType);
  title.textContent = t('manual_access_type', { type: translatedType });
  loginBtn.textContent = t('register_type_manual_button', { type: translatedType });
  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth' });
}

function resetManualLoginForm() {
  const { container, code, dni, tokenInput, credentialsForm, tokenForm } = dom.manualLogin;
  container.style.display = 'none';
  if (credentialsForm) credentialsForm.style.display = 'block';
  if (tokenForm) tokenForm.style.display = 'none';
  if(code) code.value = '';
  if(dni) dni.value = '';
  if(tokenInput) tokenInput.value = '';
  dom.loginStatus.textContent = t('searching_for_match');
  dom.loginStatus.className = 'status info';
  
  if (tokenTimerInterval) clearInterval(tokenTimerInterval);
  if (dom.manualLogin.tokenTimer) {
      dom.manualLogin.tokenTimer.parentElement.style.display = 'none';
  }
}

// ------------ Token Function ------------------- //
function startTokenTimer(durationInSeconds) {
  // Limpiar cualquier temporizador anterior
  if (tokenTimerInterval) clearInterval(tokenTimerInterval);

  let timer = durationInSeconds;
  dom.manualLogin.tokenTimer.parentElement.style.display = 'block'; // Muestra el texto del timer

  tokenTimerInterval = setInterval(() => {
    const minutes = Math.floor(timer / 60);
    let seconds = timer % 60;
    seconds = seconds < 10 ? '0' + seconds : seconds;

    dom.manualLogin.tokenTimer.textContent = `${minutes}:${seconds}`;
    if (--timer < 0) {
      clearInterval(tokenTimerInterval);
      dom.manualLogin.tokenTimer.textContent = "expirado";
    }
  }, 1000);
}


// ------------------- Navegación Segura al Menú Supervisor ------------------- //
function handleSupervisorMenuClick() {
  const storedCode = sessionStorage.getItem('supervisorCode');
  if (!storedCode) {
    alert(t('security_error_supervisor_code'));
    return;
  }

  const enteredCode = prompt(t('prompt_supervisor_code'));

  if (enteredCode === null) { // El usuario presionó "Cancelar"
    return;
  }

  if (enteredCode === storedCode) {
    window.location.href = 'menu.html';
  } else {
    alert(t('incorrect_code_denied'));
  }
}

// ------------------- Event Listeners ------------------- //
function attachListeners() {
  const el = id => document.getElementById(id);

  el('ingreso-btn')?.addEventListener('click', () => startFacialLogin('ingreso'));
  el('egreso-btn')?.addEventListener('click', () => startFacialLogin('egreso'));

  ['back-to-home-from-denied', 'back-to-home-from-denied-2', 'back-after-access', 'back-to-home-from-pending', 'back-after-pending-review'].forEach(id => {
    el(id)?.addEventListener('click', () => showScreen('home-screen'));
  });

  el('try-again-btn')?.addEventListener('click', () => startFacialLogin(currentLoginType));
  el('manual-login-btn')?.addEventListener('click', attemptManualLogin);
  el('verify-token-btn')?.addEventListener('click', verifyToken);
  el('retry-facial-login-btn')?.addEventListener('click', () => startFacialLogin(currentLoginType));
  el('supervisor-menu-btn')?.addEventListener('click', handleSupervisorMenuClick);
  el('supervisor-menu-btn-denied')?.addEventListener('click', handleSupervisorMenuClick);
}

// ------------------- Inicialización de la App ------------------- //
async function main() {
  // Detectar y manejar problemas de caché al inicio
  detectAndHandleCacheIssues();
  
  attachListeners();
  showScreen('home-screen');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
        
        // Forzar la comprobación de una nueva versión del SW en cada carga
        registration.update();
        
        // Escuchar actualizaciones del service worker
        registration.addEventListener('updatefound', () => {
          console.log('Nueva versión del service worker disponible');
          const newWorker = registration.installing;
          
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('Nueva versión instalada, recargando...');
                // Recargar para usar la nueva versión
                window.location.reload();
              }
            });
          }
        });
      })
      .catch(err => console.log('ServiceWorker registration failed: ', err));
  }

  try {
    await Promise.all([
      face.loadModels(),
      state.initState()
    ]);
    console.log('Aplicación principal inicializada.');
  } catch (error) {
    console.error('Error crítico durante la inicialización:', error);
    const homeScreen = document.getElementById('home-screen');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'status error';
    errorDiv.textContent = `Error al cargar: ${error.message}`;
    homeScreen.appendChild(errorDiv);
    
    // Marcar problema de caché si el error parece relacionado
    if (error.message.includes('models') || error.message.includes('fetch')) {
      markCacheIssues();
    }
  }
}

window.addEventListener('load', main);