import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_CONFIG } from './config.js';

// Inicializar el cliente de Supabase una sola vez
const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

// Exportar el cliente para poder usarlo en otros módulos (ej: para Realtime)
export const getSupabaseClient = () => supabase;

/**
 * Convierte una URL de datos (data URL) a un objeto Blob.
 * @param {string} dataURL La data URL a convertir.
 * @returns {Blob}
 */
function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

/**
 * Sube la foto de un usuario a Supabase Storage.
 * @param {string} base64Data La foto codificada como data URL en base64.
 * @param {string} employeeCode El legajo del empleado, usado como nombre de archivo.
 * @returns {Promise<string>} La URL pública de la foto subida.
 */
async function uploadPhoto(base64Data, employeeCode) {
    const blob = dataURLtoBlob(base64Data);
    const filePath = `empleados/${employeeCode}.png`;

    const { error: uploadError } = await supabase
        .storage
        .from('fotos')
        .upload(filePath, blob, {
            contentType: 'image/png',
            upsert: true
        });

    if (uploadError) {
        console.error('Error al subir la foto:', uploadError);
        throw uploadError;
    }

    const { data } = supabase
        .storage
        .from('fotos')
        .getPublicUrl(filePath);

    return data.publicUrl;
}

/**
 * Obtiene todos los usuarios de la base de datos.
 * @returns {Promise<Array>} Una lista de usuarios.
 */
export async function fetchUsers() {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
        console.error('Error al obtener usuarios:', error);
        throw error;
    }
    return data || [];
}

/**
 * Obtiene todos los registros de acceso de la base de datos.
 * @returns {Promise<Array>} Una lista de registros de acceso.
 */
export async function fetchAccessRecords() {
    const { data, error } = await supabase.from('access').select('*');
    if (error) {
        console.error('Error al obtener registros de acceso:', error);
        throw error;
    }
    return data || [];
}

/**
 * Registra un nuevo usuario, incluyendo su foto.
 * @param {object} userData - Los datos del usuario a registrar.
 * @returns {Promise<object>} Los datos del usuario recién creado.
 */
export async function registerUser(userData) {
    if (userData.foto) {
        try {
            const photoUrl = await uploadPhoto(userData.foto, userData.codigo_empleado);
            userData.foto = photoUrl;
        } catch (error) {
            console.error(`Falló la subida de la foto para ${userData.codigo_empleado}. Se registrará el usuario sin foto.`);
            userData.foto = null;
        }
    }

    const { data, error } = await supabase
        .from('users')
        .insert([userData])
        .select()
        .single();

    if (error) {
        console.error('Error al registrar usuario:', error);
        throw error;
    }

    return data;
}

/**
 * Registra un evento de acceso (ingreso/egreso) usando una Edge Function.
 * ESTA FUNCIÓN ES LEGACY. La lógica principal ahora está en 'resolve-authorization'.
 * @param {string} employeeCode - El legajo del empleado.
 * @param {'ingreso' | 'egreso'} type - El tipo de evento de acceso.
 * @returns {Promise<object>} El resultado de la función del servidor.
 */
export async function registerAccess(employeeCode, type) {
    const { data, error } = await supabase.functions.invoke('access', {
        body: { codigo_empleado: employeeCode, tipo: type }
    });

    if (error) {
        console.error('Error al registrar acceso:', error);
        throw error;
    }
    return data;
}

/**
 * Solicita un acceso inmediato para un empleado cuando está fuera de turno.
 * Llama a la Edge Function `request-immediate-access` que contiene la lógica principal:
 * - Verifica si el usuario está bloqueado por rechazos previos.
 * - Registra el acceso inmediatamente con estado 'pendiente_revision'.
 * - Crea la solicitud de autorización para el supervisor.
 * @param {string} employeeCode - El legajo del empleado.
 * @param {'ingreso' | 'egreso'} type - El tipo de acceso.
 * @param {object} details - Detalles para la autorización (ej: motivo del intento fuera de turno).
 * @returns {Promise<object>} El resultado de la función del servidor.
 */
export async function requestImmediateAccess(employeeCode, type, details) {
    const { data, error } = await supabase.functions.invoke('request-immediate-access', {
        body: { codigo_empleado: employeeCode, tipo: type, details: details }
    });

    if (error) {
        console.error('Error en requestImmediateAccess:', error);
        throw error;
    }
    return data;
}

/**
 * Verifica si un empleado tiene un rechazo de autorización reciente.
 * @param {string} employeeCode - El legajo del empleado.
 * @returns {Promise<boolean>} `true` si hay un rechazo reciente, `false` en caso contrario.
 */
export async function checkRecentRejection(employeeCode) {
    // Definir el rango de tiempo (últimas 12 horas)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    // El log del usuario confirmó que la tabla correcta es 'access' y las columnas son 'estado' y 'fecha_hora'.
    const { data, error } = await supabase
        .from('access') // Tabla correcta
        .select('id')
        .eq('codigo_empleado', employeeCode)
        .eq('estado', 'rechazado') // Columna y valor correctos
        .gte('fecha_hora', twelveHoursAgo) // Columna correcta
        .limit(1);

    if (error) {
        console.error('Error al verificar rechazos recientes (tabla access):', error);
        // En caso de un error de base de datos, es más seguro no bloquear al usuario.
        return false;
    }

    // Si data no es nulo y tiene al menos un elemento, significa que hay un rechazo reciente.
    return data && data.length > 0;
}


/**
 * Obtiene todos los registros de acceso que están pendientes de autorización.
 * @returns {Promise<Array>} Una lista de registros de acceso pendientes.
 */
export async function fetchPendingAuthorizations() {
    const { data, error } = await supabase
        .from('pending_authorizations')
        .select('*');

    if (error) {
        console.error('Error al obtener autorizaciones pendientes:', error);
        throw error;
    }
    return data || [];
}

/**
 * Resuelve una solicitud de autorización llamando a la Edge Function.
 * Esta función se encarga de registrar el acceso y actualizar el estado.
 * @param {number} recordId - El ID del registro en `pending_authorizations`.
 * @param {'aprobado' | 'rechazado'} action - La acción a tomar.
 * @returns {Promise<object>} El resultado de la función del servidor.
 */
export async function resolveAuthorization(recordId, action) {
    const { data, error } = await supabase.functions.invoke('resolve-authorization', {
        body: { recordId, action }
    });

    if (error) {
        console.error('Error al resolver la autorización:', error);
        throw error;
    }
    return data;
}

/**
 * Elimina una solicitud de autorización pendiente por su ID.
 * @param {number} recordId - El ID del registro a eliminar.
 * @returns {Promise<void>}
 */
export async function deletePendingAuthorization(recordId) {
    const { error } = await supabase
        .from('pending_authorizations')
        .delete()
        .eq('id', recordId);

    if (error) {
        console.error('Error al eliminar la autorización pendiente:', error);
        // No es necesario lanzar un error aquí, ya que es una operación de limpieza.
        // Un fallo aquí no debería detener el flujo principal del usuario.
    }
}
