import * as api from './api.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { t } from './i18n-logic.js';

function getShiftForHour(hour) {
    if (hour >= 6 && hour < 14) return 'Mañana';
    if (hour >= 14 && hour < 22) return 'Tarde';
    return 'Noche';
}

function getCurrentShift() {
    return getShiftForHour(new Date().getHours());
}

async function handleAccessRequest(user, loginType, isOutOfShift, metodo_autenticacion) {
    const details = isOutOfShift
        ? {
            turno_correspondiente: user.turno,
            turno_intento: getCurrentShift(),
            motivo: t('out_of_shift_attempt')
        }
        : { motivo: t('in_shift_entry_reason') };

    // La función que se llama depende de si está fuera de turno o no
    if (isOutOfShift) {
        return api.requestImmediateAccess(user.codigo_empleado, loginType, details, metodo_autenticacion);
    } else {
        return api.registerAccess(user.codigo_empleado, loginType, details, metodo_autenticacion);
    }
}

export async function grantAccess(user, appState, metodo_autenticacion) {
    if (appState.isProcessingAccess) return;
    appState.isProcessingAccess = true;

    try {
        const currentShift = getCurrentShift();
        const isOutOfShift = (appState.currentLoginType === 'ingreso' && user.turno && user.turno !== currentShift);

        await handleAccessRequest(user, appState.currentLoginType, isOutOfShift, metodo_autenticacion);
        await state.refreshState();

        ui.displayAccessGranted(user, appState.currentLoginType, isOutOfShift);

    } catch (error) {
        // Primero, verificar si es un error de tipo 409 (Conflicto)
        if (error.context && error.context.status === 409) {
            console.warn('Se detectó un conflicto (409). El usuario ya tiene una solicitud pendiente.');
            // Mostrar la pantalla de acceso provisional, ya que la solicitud original sigue siendo válida.
            ui.showScreen('pending-review-screen');
        } else {
            // Si es cualquier otro tipo de error, usar la lógica existente.
            console.error(t('grant_access_error'), error);
            let errorMessage = t('unknown_registration_error');
            if (error.context && typeof error.context.json === 'function') {
                try {
                    const jsonError = await error.context.json();
                    errorMessage = jsonError.error || errorMessage;
                } catch (e) { errorMessage = error.message; }
            } else {
                errorMessage = error.message;
            }
            denyAccess(errorMessage, user, appState.currentLoginType);
        }
    } finally {
        appState.isProcessingAccess = false;
    }
}

export function denyAccess(reason, user, currentLoginType) {
    ui.displayAccessDenied(reason, user, currentLoginType);
}

export async function attemptManualLogin(appState) {
    const code = ui.dom.manualLogin.code.value;
    const dni = ui.dom.manualLogin.dni.value;
    if (!code || !dni) return alert(t('fill_both_fields'));

    ui.updateStatus(t('sending_token'), 'info');
    ui.dom.manualLogin.loginBtn.disabled = true;

    try {
        await api.sendTokenViaFrontendEmail(code, dni);
        ui.showTokenForm(appState);
    } catch (error) {
        denyAccess(error.message || t('invalid_credentials'), null, appState.currentLoginType);
    } finally {
        ui.dom.manualLogin.loginBtn.disabled = false;
    }
}

export async function verifyToken(appState) {
    const token = ui.dom.manualLogin.tokenInput.value;
    const code = ui.dom.manualLogin.code.value;
    const dni = ui.dom.manualLogin.dni.value;

    if (!token) return alert(t('enter_received_token'));

    try {
        const { user } = await api.verifyLoginToken(token, code, dni);
        if (appState.tokenTimerInterval) clearInterval(appState.tokenTimerInterval);
        grantAccess(user, appState, 'credenciales'); // Pasar método 'credenciales'
    } catch (error) {
        denyAccess(error.message || t('invalid_or_expired_token'), null, appState.currentLoginType);
    }
}

export function handleSupervisorMenuClick() {
    const storedCode = sessionStorage.getItem('supervisorCode');
    if (!storedCode) {
        alert(t('security_error_supervisor_code'));
        return;
    }

    const enteredCode = prompt(t('prompt_supervisor_code'));

    if (enteredCode === null) {
        return;
    }

    if (enteredCode === storedCode) {
        window.location.href = 'menu.html';
    } else {
        alert(t('incorrect_code_denied'));
    }
}
