import { fetchUsers, fetchAccessRecords, fetchPendingAuthorizations } from './api.js';
import { createFaceMatcher } from './face.js';

const state = {
    users: [],
    accessRecords: [],
    pendingAuthorizations: [],
    faceMatcher: null,
    isInitialized: false,
};

export async function initState() {
    if (state.isInitialized) return;

    console.log('Inicializando estado de la aplicación (solo datos)...');
    try {
        const [users, records, authorizations] = await Promise.all([
            fetchUsers(),
            fetchAccessRecords(),
            fetchPendingAuthorizations()
        ]);

        state.users = users;
        state.accessRecords = records;
        state.pendingAuthorizations = authorizations;
        state.isInitialized = true;

        console.log('Estado inicializado:', {
            users: state.users.length,
            records: state.accessRecords.length,
            authorizations: state.pendingAuthorizations.length
        });
    } catch (error) {
        console.error("Falló la inicialización del estado:", error);
        throw error;
    }
}

/**
 * Inicializa el FaceMatcher. Debe llamarse después de initState y en páginas que lo necesiten.
 */
export function initFaceMatcher() {
    if (state.faceMatcher) return; // Evitar reinicialización
    if (!state.isInitialized) {
        console.error("El estado debe ser inicializado antes de crear el FaceMatcher.");
        return;
    }
    console.log("Creando FaceMatcher...");
    state.faceMatcher = createFaceMatcher(state.users);
    console.log("FaceMatcher creado.", !!state.faceMatcher);
}

/**
 * Agrega un nuevo usuario al estado local y actualiza el face matcher.
 * @param {object} newUser - El objeto del nuevo usuario devuelto por la API.
 */
export function addUser(newUser) {
    state.users.push(newUser);
    // Recalcular el face matcher para incluir al nuevo usuario
    state.faceMatcher = createFaceMatcher(state.users);
    console.log(`Usuario ${newUser.codigo_empleado} agregado al estado local.`);
}

/**
 * Refresca todos los datos del estado volviendo a llamar a la API.
 */
export async function refreshState() {
    // Forzar la reinicialización
    state.isInitialized = false;
    await initState();
    // Si el face matcher existía, lo reseteamos y reconstruimos para que
    // use la nueva lista de usuarios que se acaba de cargar.
    if (state.faceMatcher) {
        state.faceMatcher = null; // Resetear
        initFaceMatcher();      // Reconstruir
    }
}

// "Getters" para acceder al estado de forma segura y controlada desde otros módulos.
// Se devuelven copias de los arrays para promover la inmutabilidad y evitar efectos secundarios.
export const getUsers = () => [...state.users];
export const getAccessRecords = () => [...state.accessRecords];
export const getPendingAuthorizations = () => [...state.pendingAuthorizations];
export const getFaceMatcher = () => state.faceMatcher;
export const isInitialized = () => state.isInitialized;