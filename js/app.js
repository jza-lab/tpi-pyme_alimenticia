// Importar todos los módulos necesarios
import { APP_CONSTANTS } from './config.js';
import * as api from './api.js';
import * as face from './face.js';
import * as state from './state.js';
import { t } from './i18n-logic.js';

// ------------------- DOM Refs ------------------- //
// Cachear referencias a elementos del DOM para mayor eficiencia
const dom = {
  screens: document.querySelectorAll('.screen'),
  loginVideo: document.getElementById('login-video'),
  loginOverlay: document.getElementById('login-overlay'),
  countdown: document.getElementById('countdown'),
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
let countdownInterval = null;

// ------------------- Gestión de Pantallas ------------------- //
function showScreen(screenId) {
  if (screenId === 'home-screen') {
    sessionStorage.removeItem('isSupervisor');
    sessionStorage.removeItem('supervisorCode'); // Limpiar el código también
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
  title.textContent = t('register_type', { type });
  desc.textContent = t('position_for_scan', { type });


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
  let recognizedUser = null; // Variable para guardar el usuario reconocido
  let countdown = 5;
  dom.countdown.textContent = countdown;
  dom.loginStatus.textContent = t('searching_for_match');
  dom.loginStatus.className = 'status info';

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdown--;
    dom.countdown.textContent = Math.max(0, countdown);

    // Actualizar el mensaje si ya hemos reconocido a alguien
    if (recognizedUser) {
      dom.loginStatus.textContent = t('user_recognized_confirming', { name: recognizedUser.nombre, countdown });
    }

    if (countdown <= 0) {
      stopFacialRecognition(); // Detener todo
      if (recognizedUser) {
        grantAccess(recognizedUser); // Conceder acceso AHORA
      } else {
        showManualLoginOption(); // Si no, mostrar opción manual
      }
    }
  }, 1000);

  if (recognitionInterval) clearInterval(recognitionInterval);
  recognitionInterval = setInterval(async () => {
    // Salir solo si el video no está activo
    if (!dom.loginVideo.srcObject) return;
    const detection = await face.getSingleFaceDetection(dom.loginVideo);
    // El dibujo SIEMPRE se ejecuta si se detecta una cara.
    if (detection) {
      face.drawDetections(dom.loginVideo, dom.loginOverlay, [detection]);
    } else {
      // Si no hay cara, se limpia el canvas.
      const ctx = dom.loginOverlay.getContext('2d');
      ctx.clearRect(0, 0, dom.loginOverlay.width, dom.loginOverlay.height);
    }
    // Solo intentamos RECONOCER si aún no hemos encontrado a nadie.
    if (!recognizedUser && detection) {
      const faceMatcher = state.getFaceMatcher();
      if (faceMatcher) {
        const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

        if (bestMatch.label !== 'unknown') {
          const user = state.getUsers().find(u => u.codigo_empleado === bestMatch.label);
          if (user) {
            recognizedUser = user; // Guardamos el usuario
            // Actualizamos el estado en la UI solo una vez
            dom.loginStatus.textContent = t('user_recognized', { name: user.nombre });
            dom.loginStatus.className = 'status success';
          }
        }
      }
    }
  }, 300);

}

function stopFacialRecognition() {
  if (countdownInterval) clearInterval(countdownInterval);
  if (recognitionInterval) clearInterval(recognitionInterval);
  countdownInterval = null;
  recognitionInterval = null;
}

// ------------------- Lógica de Turnos y Acceso ------------------- //

/**
 * Determina el turno actual basado en la hora.
 * @returns {'Mañana' | 'Tarde' | 'Noche'}
 */
function getCurrentShift() {
  const currentHour = new Date().getHours();
  if (currentHour >= 6 && currentHour < 14) {
    return 'Mañana';
  } else if (currentHour >= 14 && currentHour < 22) {
    return 'Tarde';
  } else {
    return 'Noche';
  }
}

async function grantAccess(user) {
  if (isProcessingAccess) return;
  isProcessingAccess = true;

  // --- Verificación de Turno ---
  if (currentLoginType === 'ingreso' && user.turno) {
    const currentShift = getCurrentShift();
    if (user.turno !== currentShift) {
      try {
        const details = {
          turno_correspondiente: user.turno,
          turno_intento: currentShift,
          motivo: t('out_of_shift_attempt')
        };
        await api.requestAccessAuthorization(user.codigo_empleado, currentLoginType, details);
        showPendingAuthorizationScreen(user, currentLoginType);
      } catch (authError) {
        console.error("Error al solicitar autorización por turno incorrecto:", authError);
        denyAccess(t('authorization_request_error'), user);
      } finally {
        isProcessingAccess = false;
        state.refreshState();
      }
      return; // Detener la ejecución para no registrar el acceso normal
    }
  }

  // --- Lógica de Acceso Normal (si el turno es correcto o es un egreso) ---
  try {
    await api.registerAccess(user.codigo_empleado, currentLoginType);

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
    // ... (código de manejo de errores existente)
    if (error.context && typeof error.context.json === 'function') {
        try {
            const jsonError = await error.context.json();
            errorMessage = jsonError.error || errorMessage;
        } catch (e) { errorMessage = error.message; }
    } else {
        errorMessage = error.message;
    }
    
    const isAuthorizationError = errorMessage.includes('ya se encuentra dentro') || errorMessage.includes('no se encuentra dentro');

    if (isAuthorizationError) {
      try {
        // Se solicita autorización por un motivo que no es el turno (ej. ya está dentro)
        const details = { motivo: errorMessage };
        await api.requestAccessAuthorization(user.codigo_empleado, currentLoginType, details);
        showPendingAuthorizationScreen(user, currentLoginType);
      } catch (authError) {
        console.error("Error al solicitar autorización:", authError);
        denyAccess(t('authorization_request_error'), user);
      }
    } else {
      denyAccess(errorMessage, user);
    }

  } finally {
    isProcessingAccess = false;
    state.refreshState();
  }
}

function denyAccess(reason, user = null) {
  dom.denialReason.textContent = reason;
  dom.supervisorMenuBtnDenied.style.display = 'none';
  const isSupervisor = user && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.SUPERVISOR;
  const isAlreadyInsideError = reason.toLowerCase().includes('ya se encuentra dentro');
  if (currentLoginType === 'ingreso' && isSupervisor && isAlreadyInsideError) {
    sessionStorage.setItem('isSupervisor', 'true');
    sessionStorage.setItem('supervisorCode', user.codigo_empleado); // Guardar código
    dom.supervisorMenuBtnDenied.style.display = 'block';
  }

  showScreen('access-denied-screen');
}

function showPendingAuthorizationScreen(user, type) {
    const message = t('pending_authorization_message_dynamic', { type });
    dom.pendingAuth.message.textContent = message;
    showScreen('pending-authorization-screen');
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
  const { container, title, loginBtn, retryBtn } = dom.manualLogin;
  dom.loginStatus.textContent = t('recognition_failed_manual_prompt');
  dom.loginStatus.className = 'status error';
  title.textContent = t('manual_access_type', { type: currentLoginType });
  loginBtn.textContent = t('register_type_manual_button', { type: currentLoginType });
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

// ------------------- Inicialización de la Aplicación ------------------- //
async function main() {
  attachListeners();
  showScreen('home-screen');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
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
  }
}

window.addEventListener('load', main);