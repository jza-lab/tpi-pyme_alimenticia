import { fetchUsers, fetchAccessRecords, fetchPendingAuthorizations } from './api.js';
import { createFaceMatcher } from './face.js';

const state = {
    users: [],
    accessRecords: [],
    pendingAuthorizations: [],
    faceMatcher: null,
    initializationPromise: null, // Usaremos una promesa para manejar el estado de inicialización
};

export function initState() {
    // Si la promesa de inicialización no existe, la creamos.
    // Esto asegura que el proceso de carga de datos solo se inicie una vez.
    if (!state.initializationPromise) {
        console.log('Creando promesa de inicialización del estado...');
        state.initializationPromise = (async () => {
            try {
                const [users, records, authorizations] = await Promise.all([
                    fetchUsers(),
                    fetchAccessRecords(),
                    fetchPendingAuthorizations()
                ]);

                state.users = users;
                state.accessRecords = records;
                state.pendingAuthorizations = authorizations;

                console.log('Estado inicializado:', {
                    users: state.users.length,
                    records: state.accessRecords.length,
                    authorizations: state.pendingAuthorizations.length
                });
            } catch (error) {
                console.error("Falló la inicialización del estado:", error);
                // Reiniciar la promesa para permitir un reintento
                state.initializationPromise = null; 
                throw error;
            }
        })();
    }
    // Devolvemos la promesa existente (o la recién creada).
    // Cualquier llamada subsiguiente a initState simplemente esperará a que esta promesa se resuelva.
    return state.initializationPromise;
}


/**
 * Inicializa el FaceMatcher. Debe llamarse después de initState y en páginas que lo necesiten.
 */
export async function initFaceMatcher() {
    if (state.faceMatcher) return; // Evitar reinicialización

    // Esperar a que el estado esté completamente inicializado
    await initState();
    
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

// "Getters" para acceder al estado de forma segura y controlada desde otros módulos.
// Se devuelven copias de los arrays para promover la inmutabilidad y evitar efectos secundarios.
export const getUsers = () => [...state.users];
export const getAccessRecords = () => [...state.accessRecords];
export const getPendingAuthorizations = () => [...state.pendingAuthorizations];
export const getFaceMatcher = () => state.faceMatcher;