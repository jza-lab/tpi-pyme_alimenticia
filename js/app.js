// Importar todos los módulos necesarios
import { APP_CONSTANTS } from './config.js';
import * as api from './api.js';
import * as face from './face.js';
import * as state from './state.js';

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
  showScreen('login-screen');
  resetManualLoginForm();

  const title = document.getElementById('login-title');
  const desc = document.getElementById('login-description');
  title.textContent = `Registro de ${type === 'ingreso' ? 'Ingreso' : 'Egreso'}`;
  desc.textContent = `Por favor, colóquese frente a la cámara para registrar su ${type}.`;

  try {
    await startVideoStream(dom.loginVideo);
    runFacialRecognition();
  } catch (error) {
    dom.loginStatus.textContent = error.message;
    dom.loginStatus.className = 'status error';
    showManualLoginOption();
  }
}

function runFacialRecognition() {
  let recognized = false;
  let countdown = 5;
  dom.countdown.textContent = countdown;

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdown--;
    dom.countdown.textContent = Math.max(0, countdown);
    if (countdown <= 0 && !recognized) {
      stopFacialRecognition();
      showManualLoginOption();
    }
  }, 1000);

  if (recognitionInterval) clearInterval(recognitionInterval);
  recognitionInterval = setInterval(async () => {
    if (!dom.loginVideo.srcObject) return;

    const detection = await face.getSingleFaceDetection(dom.loginVideo);
    const faceMatcher = state.getFaceMatcher();

    if (detection && faceMatcher) {
      face.drawDetections(dom.loginVideo, dom.loginOverlay, [detection]);
      const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

      if (bestMatch.label !== 'unknown') {
        recognized = true;
        stopFacialRecognition();
        const user = state.getUsers().find(u => u.codigo_empleado === bestMatch.label);
        if (user) grantAccess(user);
      }
    } else {
      const ctx = dom.loginOverlay.getContext('2d');
      ctx.clearRect(0, 0, dom.loginOverlay.width, dom.loginOverlay.height);
    }
  }, 300);
}

function stopFacialRecognition() {
  if (countdownInterval) clearInterval(countdownInterval);
  if (recognitionInterval) clearInterval(recognitionInterval);
  countdownInterval = null;
  recognitionInterval = null;
}

// ------------------- Lógica de Acceso ------------------- //
async function grantAccess(user) {
  if (isProcessingAccess) return;
  isProcessingAccess = true;

  try {
    await api.registerAccess(user.codigo_empleado, currentLoginType);

    dom.welcomeMessage.textContent = `${user.nombre}, su ${currentLoginType} ha sido registrado.`;

    if (currentLoginType === 'ingreso' && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.SUPERVISOR) {
      dom.supervisorMenuBtn.style.display = 'block';
      sessionStorage.setItem('isSupervisor', 'true');
    } else {
      dom.supervisorMenuBtn.style.display = 'none';
    }

    showScreen('access-granted-screen');
  } catch (error) {
    // --- CÓDIGO DE DEPURACIÓN ---
    console.log("--- INICIO DEL OBJETO DE ERROR COMPLETO ---");
    console.log(error);
    console.log("--- FIN DEL OBJETO DE ERROR ---");

    // Intentemos acceder al mensaje de diferentes maneras
    const specificMessage = error.context?.json?.error || error.details || error.message;
    
    denyAccess(specificMessage);

  } finally {
    isProcessingAccess = false;
    state.refreshState(); // Refrescar el estado para la próxima operación
  }
}

function denyAccess(reason) {
  dom.denialReason.textContent = reason;
  showScreen('access-denied-screen');
}

// ------------------- Acceso Manual ------------------- //
async function attemptManualLogin() {
  const code = dom.manualLogin.code.value;
  const dni = dom.manualLogin.dni.value;
  if (!code || !dni) return alert('Por favor, complete ambos campos.');

  const user = state.getUsers().find(u => u.codigo_empleado === code && u.dni === dni);
  if (user) {
    grantAccess(user);
  } else {
    denyAccess('Credenciales incorrectas.');
  }
}

function showManualLoginOption() {
  const { container, title, loginBtn, retryBtn } = dom.manualLogin;
  dom.loginStatus.textContent = 'Reconocimiento fallido. Pruebe el acceso manual.';
  dom.loginStatus.className = 'status error';
  title.textContent = `Acceso Manual de ${currentLoginType}`;
  loginBtn.textContent = `Registrar ${currentLoginType}`;
  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth' });
}

function resetManualLoginForm() {
  const { container, code, dni } = dom.manualLogin;
  container.style.display = 'none';
  code.value = '';
  dni.value = '';
  dom.loginStatus.textContent = 'Buscando coincidencias...';
  dom.loginStatus.className = 'status info';
}

// ------------------- Event Listeners ------------------- //
function attachListeners() {
    const el = id => document.getElementById(id);

    el('ingreso-btn')?.addEventListener('click', () => startFacialLogin('ingreso'));
    el('egreso-btn')?.addEventListener('click', () => startFacialLogin('egreso'));
    
    ['back-to-home-from-denied', 'back-to-home-from-denied-2', 'back-after-access'].forEach(id => {
        el(id)?.addEventListener('click', () => showScreen('home-screen'));
    });

    el('try-again-btn')?.addEventListener('click', () => startFacialLogin(currentLoginType));
    el('manual-login-btn')?.addEventListener('click', attemptManualLogin);
    el('retry-facial-login-btn')?.addEventListener('click', () => startFacialLogin(currentLoginType));
    el('supervisor-menu-btn')?.addEventListener('click', () => window.location.href = 'menu.html');
}

// ------------------- Inicialización de la Aplicación ------------------- //
async function main() {
    attachListeners();
    showScreen('home-screen');
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