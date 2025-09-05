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

// Modificar la función showPendingAuthorizationScreen para incluir detección de problemas:
function showPendingAuthorizationScreen(user, type) {
    const translatedType = t(type);
    const message = t('pending_authorization_message_dynamic', { type: translatedType });
    dom.pendingAuth.message.textContent = message;
    showScreen('pending-authorization-screen');

    if (authorizationCheckInterval) clearInterval(authorizationCheckInterval);
    
    // Agregar contador de reintentos para detectar problemas
    let checkAttempts = 0;
    const maxCheckAttempts = 20; // 100 segundos máximo
    
    authorizationCheckInterval = setInterval(async () => {
        checkAttempts++;
        
        // Si llevamos muchos reintentos, puede haber un problema de caché
        if (checkAttempts > maxCheckAttempts) {
            console.warn('Demasiados reintentos de autorización, posible problema de caché');
            clearInterval(authorizationCheckInterval);
            markCacheIssues();
            showScreen('home-screen');
            return;
        }
        
        await checkAuthorizationStatus(user.codigo_empleado, type);
    }, 5000);
}

// ------------------- DOM Refs ------------------- //
// Cachear referencias a elementos del DOM para mayor eficiencia
const dom = {
  screens: document.querySelectorAll('.screen'),
  loginVideo: document.getElementById('login-video'),
  loginOverlay: document.getElementById('login-overlay'),
  loginStatus: document.getElementById('login-status'),
  welcomeMessage: document.getElementById('welcome-message'),
  denialReason: document.getElementById('denial-reason'),
  supervisorMenuBtn: document.getElementById('supervisor-menu-btn'),
  supervisorMenuBtnDenied: document.getElementById('supervisor-menu-btn-denied'),
  pendingAuth: {
    message: document.getElementById('pending-auth-message'),
    backBtn: document.getElementById('back-to-home-from-pending'),
  },
  manualLogin: {
    container: document.getElementById('manual-login'),
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

const AUTH_ATTEMPTS_KEY_PREFIX = 'auth_attempts_';
const MAX_AUTH_ATTEMPTS = 2;

/**
 * Obtiene el número de intentos de autorización para un empleado.
 * @param {string} employeeCode - El legajo del empleado.
 * @returns {number} - El número de intentos.
 */
function getAuthorizationAttempts(employeeCode) {
    const attempts = sessionStorage.getItem(`${AUTH_ATTEMPTS_KEY_PREFIX}${employeeCode}`);
    return attempts ? parseInt(attempts, 10) : 0;
}

/**
 * Incrementa el contador de intentos de autorización para un empleado.
 * @param {string} employeeCode - El legajo del empleado.
 */
function incrementAuthorizationAttempts(employeeCode) {
    const attempts = getAuthorizationAttempts(employeeCode);
    sessionStorage.setItem(`${AUTH_ATTEMPTS_KEY_PREFIX}${employeeCode}`, attempts + 1);
}

/**
 * Limpia el contador de intentos de autorización para un empleado.
 * @param {string} employeeCode - El legajo del empleado.
 */
function clearAuthorizationAttempts(employeeCode) {
    sessionStorage.removeItem(`${AUTH_ATTEMPTS_KEY_PREFIX}${employeeCode}`);
}


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

// Reemplazar la función grantAccess completa en app.js:

async function grantAccess(user) {
  if (isProcessingAccess) return;
  isProcessingAccess = true;

  try {
    // Refrescar estado antes de verificar autorizaciones pendientes
    await state.refreshState();
    
    // --- Verificación de Autorizaciones Pendientes ---
    const pendingAuths = state.getPendingAuthorizations();
    const hasPendingAuth = pendingAuths.some(
      auth => auth.codigo_empleado === user.codigo_empleado && auth.tipo === currentLoginType
    );

    if (hasPendingAuth) {
      denyAccess(t('authorization_already_pending'), user);
      return;
    }

    // --- Lógica para Ingreso Fuera de Turno ---
    const currentShift = getCurrentShift();
    const isOutOfShift = (currentLoginType === 'ingreso' && user.turno && user.turno !== currentShift);
    
    let wasAlreadyApprovedForThisShift = false;
    if (isOutOfShift) {
        const records = state.getAccessRecords();
        const lastRecord = records
            .filter(r => r.codigo_empleado === user.codigo_empleado)
            .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))[0];

        if (lastRecord && lastRecord.tipo === 'ingreso') {
            const recordDate = new Date(lastRecord.fecha_hora + 'Z');
            const recordShift = getShiftForHour(recordDate.getUTCHours());
            if (recordShift === currentShift) {
                wasAlreadyApprovedForThisShift = true;
            }
        }
    }

    // Si es un intento fuera de turno y NO fue aprobado previamente para este turno...
    if (isOutOfShift && !wasAlreadyApprovedForThisShift) {
      const attempts = getAuthorizationAttempts(user.codigo_empleado);
      
      if (attempts >= MAX_AUTH_ATTEMPTS) {
        const reason = t('max_authorization_attempts_exceeded', { max: MAX_AUTH_ATTEMPTS });
        denyAccess(reason, user);
        return;
      }

      try {
        const details = {
          turno_correspondiente: user.turno,
          turno_intento: currentShift,
          motivo: t('out_of_shift_attempt')
        };
        await api.requestAccessAuthorization(user.codigo_empleado, currentLoginType, details);
        incrementAuthorizationAttempts(user.codigo_empleado);
        
        // Refrescar el estado después de crear la autorización
        await state.refreshState();
        
        showPendingAuthorizationScreen(user, currentLoginType);
        return; // Detener la ejecución para esperar la autorización
      } catch (authError) {
        console.error("Error al solicitar autorización por turno incorrecto:", authError);
        denyAccess(t('authorization_request_error'), user);
        return;
      }
    }

    // --- Lógica de Acceso Normal ---
    try {
      await api.registerAccess(user.codigo_empleado, currentLoginType);

      // Refrescar el estado después del registro exitoso
      await state.refreshState();

      // Si el acceso fue exitoso, limpiar los intentos de autorización
      clearAuthorizationAttempts(user.codigo_empleado);

      dom.welcomeMessage.textContent = t('access_registered_message', { name: user.nombre, type: currentLoginType });

      if (currentLoginType === 'ingreso' && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.SUPERVISOR) {
        dom.supervisorMenuBtn.style.display = 'block';
        sessionStorage.setItem('isSupervisor', 'true');
        sessionStorage.setItem('supervisorCode', user.codigo_empleado);
      } else {
        dom.supervisorMenuBtn.style.display = 'none';
      }

      showScreen('access-granted-screen');
    } catch (error) {
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

        // Corregido: En lugar de crear una nueva solicitud de autorización,
        // simplemente mostramos el error al usuario. El flujo de autorización
        // solo debe ser iniciado por lógicas específicas (ej: fuera de turno).
        denyAccess(errorMessage, user);
    }

  } catch (stateError) {
    console.error("Error refreshing state in grantAccess:", stateError);
    denyAccess(t('unknown_registration_error'), user);
  } finally {
    isProcessingAccess = false;
  }
}

function denyAccess(reason, user = null) {
  dom.denialReason.textContent = reason;
  dom.supervisorMenuBtnDenied.style.display = 'none';
  const isSupervisor = user && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.SUPERVISOR;
  const isAlreadyInsideError = reason.toLowerCase().includes('ya se encuentra dentro');
  if (currentLoginType === 'ingreso' && isSupervisor && isAlreadyInsideError) {
    sessionStorage.setItem('isSupervisor', 'true');
    sessionStorage.setItem('supervisorCode', user.codigo_empleado); // Guardar legajo
    dom.supervisorMenuBtnDenied.style.display = 'block';
  }

  showScreen('access-denied-screen');
}

async function checkAuthorizationStatus(employeeCode, type) {
    try {
        // Forzar refresh completo del estado para evitar problemas de caché
        await state.refreshState();
        const pendingAuths = state.getPendingAuthorizations();

        const myAuthRequest = pendingAuths.find(auth =>
            auth.codigo_empleado === employeeCode &&
            auth.tipo === type
        );

        if (!myAuthRequest || !myAuthRequest.estado) {
            if (authorizationCheckInterval) clearInterval(authorizationCheckInterval);
            // The request is gone or in an old format. This can happen if it was resolved
            // by another client. Safest action is to return to home.
            showScreen('home-screen');
            return;
        }

        const user = state.getUsers().find(u => u.codigo_empleado === employeeCode);

        if (myAuthRequest.estado === 'aprobado') {
            if (authorizationCheckInterval) clearInterval(authorizationCheckInterval);
            isProcessingAccess = true;

            try {
                // IMPORTANTE: Refrescar el estado DESPUÉS de la aprobación para obtener el nuevo registro
                await state.refreshState();
                
                // Limpiar la autorización pendiente
                await api.deletePendingAuthorization(myAuthRequest.id);

                // Limpiar intentos de autorización
                clearAuthorizationAttempts(employeeCode);
                
                dom.welcomeMessage.textContent = t('access_registered_message', { name: user.nombre, type: type });

                if (type === 'ingreso' && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.SUPERVISOR) {
                    dom.supervisorMenuBtn.style.display = 'block';
                    sessionStorage.setItem('isSupervisor', 'true');
                    sessionStorage.setItem('supervisorCode', user.codigo_empleado);
                } else {
                    dom.supervisorMenuBtn.style.display = 'none';
                }

                showScreen('access-granted-screen');
            } catch (error) {
                console.error("Error during cleanup of approved access:", error);
                // El acceso ya fue otorgado, mostrar pantalla de éxito aunque falle la limpieza
                showScreen('access-granted-screen');
            } finally {
                isProcessingAccess = false;
            }

        } else if (myAuthRequest.estado === 'rechazado') {
            if (authorizationCheckInterval) clearInterval(authorizationCheckInterval);
            
            try {
                await api.deletePendingAuthorization(myAuthRequest.id);
            } catch (error) {
                console.error("Error cleaning up rejected authorization:", error);
            }
            
            const attempts = getAuthorizationAttempts(employeeCode);
            let reason = t('authorization_rejected');

            if (attempts < MAX_AUTH_ATTEMPTS) {
                const remaining = MAX_AUTH_ATTEMPTS - attempts;
                reason += ` ${t('you_have_x_attempts_left', { count: remaining })}`;
            } else {
                reason += ` ${t('no_more_attempts_left')}`;
            }
            denyAccess(reason, user);
        }
        // If status is 'pendiente', do nothing and let the interval poll again.
    } catch (error) {
        console.error("Error in checkAuthorizationStatus:", error);
        // En caso de error, volver al home para evitar estados inconsistentes
        if (authorizationCheckInterval) clearInterval(authorizationCheckInterval);
        showScreen('home-screen');
    }
}

// ------------------- Acceso Manual ------------------- //
async function attemptManualLogin() {
  const code = dom.manualLogin.code.value;
  const dni = dom.manualLogin.dni.value;
  if (!code || !dni) return alert(t('fill_both_fields'));

  const user = state.getUsers().find(u => u.codigo_empleado === code && u.dni === dni);
  if (user) {
    grantAccess(user);
  } else {
    denyAccess(t('incorrect_credentials'));
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
  const { container, code, dni } = dom.manualLogin;
  container.style.display = 'none';
  code.value = '';
  dni.value = '';
  dom.loginStatus.textContent = t('searching_for_match');
  dom.loginStatus.className = 'status info';
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

  ['back-to-home-from-denied', 'back-to-home-from-denied-2', 'back-after-access', 'back-to-home-from-pending'].forEach(id => {
    el(id)?.addEventListener('click', () => showScreen('home-screen'));
  });

  el('try-again-btn')?.addEventListener('click', () => startFacialLogin(currentLoginType));
  el('manual-login-btn')?.addEventListener('click', attemptManualLogin);
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