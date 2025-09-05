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

    console.log('Inicializando estado de la aplicación...');
    try {
        const [users, records, authorizations] = await Promise.all([
            fetchUsers(),
            fetchAccessRecords(),
            fetchPendingAuthorizations()
        ]);

        state.users = users;
        state.accessRecords = records;
        state.pendingAuthorizations = authorizations;
        state.faceMatcher = createFaceMatcher(users);
        state.isInitialized = true;

        console.log('Estado inicializado:', {
            users: state.users.length,
            records: state.accessRecords.length,
            authorizations: state.pendingAuthorizations.length,
            hasFaceMatcher: !!state.faceMatcher
        });
    } catch (error) {
        console.error("Falló la inicialización del estado:", error);
        throw error;
    }
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
}

// "Getters" para acceder al estado de forma segura y controlada desde otros módulos.
// Se devuelven copias de los arrays para promover la inmutabilidad y evitar efectos secundarios.
export const getUsers = () => [...state.users];
export const getAccessRecords = () => [...state.accessRecords];
export const getPendingAuthorizations = () => [...state.pendingAuthorizations];
export const getFaceMatcher = () => state.faceMatcher;
export const isInitialized = () => state.isInitialized;