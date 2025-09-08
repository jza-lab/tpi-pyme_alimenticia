// js/ui.js
import { t } from './i18n-logic.js';
import { APP_CONSTANTS } from './config.js';

// Cachear referencias a elementos del DOM para mayor eficiencia
export const dom = {
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

let stopRecognitionCallback = () => { };
let stopVideoStreamCallback = () => { };

export function initUI(stopRecCb, stopVidCb) {
    stopRecognitionCallback = stopRecCb;
    stopVideoStreamCallback = stopVidCb;
}

export function showScreen(screenId) {
    dom.screens.forEach(s => s.classList.remove('active'));
    const screenToShow = document.getElementById(screenId);
    if (screenToShow) {
        screenToShow.classList.add('active');
    }

    if (screenId === 'home-screen') {
        sessionStorage.removeItem('isSupervisor');
        sessionStorage.removeItem('supervisorCode');
    }

    if (screenId !== 'login-screen') {
        stopRecognitionCallback();
        stopVideoStreamCallback(dom.loginVideo);
    }
}

export function updateStatus(text, type = 'info') {
    if (dom.loginStatus) {
        dom.loginStatus.textContent = text;
        dom.loginStatus.className = `status ${type}`;
    }
}

export function updateLoginScreenText(loginType) {
    const title = document.getElementById('login-title');
    const desc = document.getElementById('login-description');
    const translatedType = t(loginType);
    title.textContent = t('register_type', { type: translatedType });
    desc.textContent = t('position_for_scan', { type: translatedType });
}

export function showManualLoginOption(currentLoginType) {
    const { container, title, loginBtn } = dom.manualLogin;
    updateStatus(t('recognition_failed_manual_prompt'), 'error');
    const translatedType = t(currentLoginType);
    title.textContent = t('manual_access_type', { type: translatedType });
    loginBtn.textContent = t('register_type_manual_button', { type: translatedType });
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
}

export function resetManualLoginForm(appState) {
    const { container, code, dni, tokenInput, credentialsForm, tokenForm } = dom.manualLogin;
    container.style.display = 'none';
    if (credentialsForm) credentialsForm.style.display = 'block';
    if (tokenForm) tokenForm.style.display = 'none';
    if (code) code.value = '';
    if (dni) dni.value = '';
    if (tokenInput) tokenInput.value = '';
    updateStatus(t('searching_for_match'), 'info');

    if (appState.tokenTimerInterval) clearInterval(appState.tokenTimerInterval);
    if (dom.manualLogin.tokenTimer) {
        dom.manualLogin.tokenTimer.parentElement.style.display = 'none';
    }
}

export function showTokenForm(appState) {
    dom.manualLogin.credentialsForm.style.display = 'none';
    dom.manualLogin.tokenForm.style.display = 'block';
    updateStatus(t('Token Enviado'), 'info');
    startTokenTimer(900, appState);
}

function startTokenTimer(durationInSeconds, appState) {
    if (appState.tokenTimerInterval) clearInterval(appState.tokenTimerInterval);

    let timer = durationInSeconds;
    dom.manualLogin.tokenTimer.parentElement.style.display = 'block';

    appState.tokenTimerInterval = setInterval(() => {
        const minutes = Math.floor(timer / 60);
        let seconds = timer % 60;
        seconds = seconds < 10 ? '0' + seconds : seconds;

        dom.manualLogin.tokenTimer.textContent = `${minutes}:${seconds}`;
        if (--timer < 0) {
            clearInterval(appState.tokenTimerInterval);
            dom.manualLogin.tokenTimer.textContent = "expirado";
        }
    }, 1000);
}

export function displayAccessGranted(user, currentLoginType, isOutOfShift) {
    if (isOutOfShift) {
        showScreen('access-pending-review-screen');
    } else {
        dom.welcomeMessage.textContent = t('access_registered_message', { name: user.nombre, type: t(currentLoginType) });

        if (currentLoginType === 'ingreso' && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.ANALISTA) {
            dom.supervisorMenuBtn.style.display = 'block';
            sessionStorage.setItem('isSupervisor', 'true');
            sessionStorage.setItem('supervisorCode', user.codigo_empleado);
        } else {
            dom.supervisorMenuBtn.style.display = 'none';
        }
        showScreen('access-granted-screen');
    }
}

function setDenialReason(reason, user) {
    dom.denialTitle.textContent = t('Acceso Denegado');
    let reasonText = reason;

    const lowerCaseReason = reason.toLowerCase();

    if (lowerCaseReason.includes('dentro')) {
        dom.denialTitle.textContent = t('denial_title_entry');
        reasonText = t('denial_reason_entry', { name: user?.nombre || t('the_user') });
    } else if (lowerCaseReason.includes('fuera')) {
        dom.denialTitle.textContent = t('denial_title_exit');
        reasonText = t('denial_reason_exit', { name: user?.nombre || t('the_user') });
    }

    dom.denialReason.textContent = reasonText;
}

function handleSupervisorButtonOnDenial(reason, user, currentLoginType) {
    dom.supervisorMenuBtnDenied.style.display = 'none'; // Default

    const isAnalystOrHigher = user && user.nivel_acceso >= APP_CONSTANTS.USER_LEVELS.ANALISTA;
    const isAlreadyInsideError = reason.toLowerCase().includes('dentro');

    if (currentLoginType === 'ingreso' && isAnalystOrHigher && isAlreadyInsideError) {
        sessionStorage.setItem('isSupervisor', 'true');
        sessionStorage.setItem('supervisorCode', user.codigo_empleado);
        dom.supervisorMenuBtnDenied.style.display = 'block';
    }
}

export function displayAccessDenied(reason, user, currentLoginType) {
    showScreen('access-denied-screen');
    setDenialReason(reason, user);
    handleSupervisorButtonOnDenial(reason, user, currentLoginType);
}
