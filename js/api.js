import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_CONFIG } from './config.js';

// Inicializar el cliente de Supabase una sola vez
const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

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
 * @param {string} employeeCode El código del empleado, usado como nombre de archivo.
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
 * @param {string} employeeCode - El código del empleado.
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
 * Crea una solicitud de autorización de acceso en la tabla 'pending_authorizations'.
 * @param {string} employeeCode - El código del empleado.
 * @param {'ingreso' | 'egreso'} type - El tipo de evento de acceso.
 * @param {object} [details={}] - Detalles adicionales para la autorización.
 * @returns {Promise<object>} El registro de autorización pendiente recién creado.
 */
export async function requestAccessAuthorization(employeeCode, type, details = {}) {
    const payload = {
        codigo_empleado: employeeCode,
        tipo: type,
        details: details, // Campo 'details' de tipo JSONB en Supabase
    };

    const { data, error } = await supabase
        .from('pending_authorizations')
        .insert([payload])
        .select()
        .single();

    if (error) {
        console.error('Error al solicitar autorización de acceso:', error);
        throw error;
    }
    return data;
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
 * Resuelve una solicitud de autorización pendiente.
 * Si se aprueba, registra el acceso y elimina la solicitud pendiente.
 * Si se rechaza, simplemente elimina la solicitud pendiente.
 * @param {number} recordId - El ID del registro en `pending_authorizations`.
 * @param {'aprobado' | 'rechazado'} status - La acción a tomar.
 * @returns {Promise<object>} El resultado de la operación.
 */
export async function updateAccessStatus(recordId, status) {
    // 1. Obtener los detalles de la solicitud pendiente
    const { data: pendingRecord, error: fetchError } = await supabase
        .from('pending_authorizations')
        .select('*')
        .eq('id', recordId)
        .single();

    if (fetchError) {
        console.error('Error al buscar la autorización pendiente:', fetchError);
        throw fetchError;
    }

    if (!pendingRecord) {
        throw new Error('La solicitud de autorización no fue encontrada.');
    }

    // 2. Si se aprueba, registrar el acceso usando la Edge Function existente
    if (status === 'aprobado') {
        try {
            await registerAccess(pendingRecord.codigo_empleado, pendingRecord.tipo);
        } catch (registerError) {
            // Incluso si el registro falla (ej. el estado del empleado cambió de nuevo),
            // se debe intentar eliminar la solicitud para evitar que quede bloqueada.
            console.error('Error al registrar el acceso aprobado:', registerError);
            // No relanzamos el error para permitir que la limpieza continúe.
        }
    }

    // 3. Eliminar la solicitud de la tabla de pendientes
    const { error: deleteError } = await supabase
        .from('pending_authorizations')
        .delete()
        .eq('id', recordId);

    if (deleteError) {
        console.error('Error al eliminar la autorización pendiente:', deleteError);
        throw deleteError;
    }

    return { success: true, message: `Solicitud ${status} con éxito.` };
}
