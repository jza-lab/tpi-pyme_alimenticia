// Importar todos los módulos necesarios
import * as face from './face.js';
import * as state from './state.js';
import * as ui from './ui.js';
import * as auth from './auth.js';
import { t } from './i18n-logic.js';

// ------------------- Estado de la App ------------------- //
const appState = {
    currentLoginType: 'ingreso',
    isProcessingAccess: false,
    recognitionInterval: null,
    authorizationCheckInterval: null,
    tokenTimerInterval: null,
};

// ------------------- Cache ------------------- //
function forceServiceWorkerUpdate() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => registration.update());
        });
    }
}

function detectAndHandleCacheIssues() {
    const hasInconsistencies = sessionStorage.getItem('auth_cache_issues') === 'true';
    if (hasInconsistencies) {
        console.warn('Detectados problemas de caché, forzando actualización...');
        forceServiceWorkerUpdate();
        sessionStorage.removeItem('auth_cache_issues');
    }
}

function markCacheIssues() {
    sessionStorage.setItem('auth_cache_issues', 'true');
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
function stopFacialRecognition() {
    if (appState.recognitionInterval) clearInterval(appState.recognitionInterval);
    appState.recognitionInterval = null;
}

async function startFacialLogin(type) {
    await state.refreshState();
    appState.currentLoginType = type;

    const { loginOverlay, loginVideo } = ui.dom;
    const ctx = loginOverlay.getContext('2d');
    ctx.clearRect(0, 0, loginOverlay.width, loginOverlay.height);

    ui.showScreen('login-screen');
    ui.resetManualLoginForm(appState);
    ui.updateLoginScreenText(type);

    try {
        await startVideoStream(loginVideo);
        runFacialRecognition();
    } catch (error) {
        ui.updateStatus(t('camera_access_error'), 'error');
        ui.showManualLoginOption(appState.currentLoginType);
    }
}

function runFacialRecognition() {
    ui.updateStatus(t('searching_for_match'), 'info');
    let recognitionAttempts = 0;
    const maxAttempts = 15;

    if (appState.recognitionInterval) clearInterval(appState.recognitionInterval);
    appState.recognitionInterval = setInterval(async () => {
        const { loginVideo } = ui.dom;
        if (!loginVideo.srcObject || recognitionAttempts >= maxAttempts) {
            stopFacialRecognition();
            stopVideoStream(loginVideo);
            ui.showManualLoginOption(appState.currentLoginType);
            return;
        }

        recognitionAttempts++;
        const detection = await face.getSingleFaceDetection(loginVideo);
        const { loginOverlay } = ui.dom;

        if (detection) {
            face.drawDetections(loginVideo, loginOverlay, [detection]);
            const faceMatcher = state.getFaceMatcher();
            if (faceMatcher) {
                const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                if (bestMatch.label !== 'unknown') {
                    const user = state.getUsers().find(u => u.codigo_empleado === bestMatch.label);
                    if (user) {
                        stopFacialRecognition();
                        ui.updateStatus(t('user_recognized', { name: user.nombre }), 'success');
                        // Se pasa 'reconocimiento_facial' como método de autenticación
                        auth.grantAccess(user, appState, 'reconocimiento_facial');
                    }
                }
            }
        } else {
            const ctx = loginOverlay.getContext('2d');
            ctx.clearRect(0, 0, loginOverlay.width, loginOverlay.height);
        }
    }, 300);
}

// ------------------- Event Listeners ------------------- //
function attachListeners() {
    const el = id => document.getElementById(id);

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            console.log('Page was restored from bfcache. Re-initializing state.');
            if (document.getElementById('login-screen').classList.contains('active')) {
                startFacialLogin(appState.currentLoginType);
            }
        }
    });

    el('ingreso-btn')?.addEventListener('click', () => startFacialLogin('ingreso'));
    el('egreso-btn')?.addEventListener('click', () => startFacialLogin('egreso'));

    el('try-again-btn')?.addEventListener('click', () => startFacialLogin(appState.currentLoginType));
    el('retry-facial-login-btn')?.addEventListener('click', () => startFacialLogin(appState.currentLoginType));

    ['back-to-home-from-denied', 'back-after-access', 'back-to-home-from-pending'].forEach(id => {
        el(id)?.addEventListener('click', () => ui.showScreen('home-screen'));
    });

    el('back-after-pending-review')?.addEventListener('click', () => startFacialLogin('ingreso'));

    el('manual-login-btn')?.addEventListener('click', () => auth.attemptManualLogin(appState));
    el('verify-token-btn')?.addEventListener('click', () => auth.verifyToken(appState));

    el('supervisor-menu-btn')?.addEventListener('click', auth.handleSupervisorMenuClick);
    el('supervisor-menu-btn-denied')?.addEventListener('click', auth.handleSupervisorMenuClick);
}

// ------------------- Inicialización de la App ------------------- //
async function main() {
    detectAndHandleCacheIssues();

    try {
        emailjs.init({ publicKey: "JCioEYp4izZHGAoHd" });
    } catch (e) {
        console.error('Error al inicializar EmailJS.', e);
    }

    ui.initUI(stopFacialRecognition, stopVideoStream);
    attachListeners();
    ui.showScreen('home-screen');

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
                registration.update();
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
        state.initFaceMatcher();
        console.log('Aplicación principal inicializada.');
    } catch (error) {
        console.error('Error crítico durante la inicialización:', error);
        const homeScreen = document.getElementById('home-screen');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'status error';
        errorDiv.textContent = `Error al cargar: ${error.message}`;
        homeScreen.appendChild(errorDiv);

        if (error.message.includes('models') || error.message.includes('fetch')) {
            markCacheIssues();
        }
    }
}

window.addEventListener('load', main);