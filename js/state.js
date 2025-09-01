import { fetchUsers, fetchAccessRecords } from './api.js';
import { createFaceMatcher } from './face.js';

// El estado en sí no se exporta para protegerlo de modificaciones directas.
const state = {
    users: [],
    accessRecords: [],
    faceMatcher: null,
    isInitialized: false,
};

/**
 * Inicializa el estado de la aplicación cargando todos los datos necesarios desde la API.
 * Es seguro llamar a esta función varias veces; los datos solo se cargarán una vez.
 */
export async function initState() {
    if (state.isInitialized) return;

    console.log('Inicializando estado de la aplicación...');
    try {
        // Cargar datos iniciales en paralelo para mayor eficiencia
        const [users, records] = await Promise.all([
            fetchUsers(),
            fetchAccessRecords()
        ]);

        state.users = users;
        state.accessRecords = records;
        // Crear el face matcher a partir de los usuarios cargados
        state.faceMatcher = createFaceMatcher(users);
        state.isInitialized = true;

        console.log('Estado inicializado:', {
            users: state.users.length,
            records: state.accessRecords.length,
            hasFaceMatcher: !!state.faceMatcher
        });
    } catch (error) {
        console.error("Falló la inicialización del estado:", error);
        // Volver a lanzar el error para que la UI pueda reaccionar
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
export const getFaceMatcher = () => state.faceMatcher;
export const isInitialized = () => state.isInitialized;