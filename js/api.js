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
 * Registra un evento de acceso normal (dentro del turno).
 * @param {string} employeeCode - El legajo del empleado.
 * @param {'ingreso' | 'egreso'} type - El tipo de evento de acceso.
 * @param {object} details - Detalles del acceso.
 * @param {string} metodo_autenticacion - Método usado ('facial' o 'credenciales').
 * @param {string|null} fecha_hora - Fecha y hora opcional para registros manuales.
 * @returns {Promise<object>} El resultado de la función del servidor.
 */
export async function registerAccess(employeeCode, type, details, metodo_autenticacion, fecha_hora = null) {
    const body = {
        codigo_empleado: employeeCode,
        tipo: type,
        details: details,
        metodo_autenticacion: metodo_autenticacion
    };
    if (fecha_hora) {
        body.fecha_hora = fecha_hora;
    }

    // El nombre de la Edge Function es 'access'
    console.log("DEBUG: Enviando a access:", body);
    const { data, error } = await supabase.functions.invoke('access', {
        body: body
    });

    if (error) {
        console.error('Error al registrar acceso:', error);
        throw error;
    }
    return data;
}

/**
 * Obtiene las estadísticas de acceso (conteo por método de autenticación).
 * @returns {Promise<{credenciales: number, reconocimiento_facial: number}>}
 */
export async function fetchAccessStats() {
    const { data, error } = await supabase.functions.invoke('get-access-stats');

    if (error) {
        console.error('Error al obtener estadísticas de acceso:', error);
        throw error;
    }
    return data;
}

/**
 * Obtiene todos los datos de una tabla específica de la base de datos.
 * @param {string} tableName - El nombre de la tabla de la que se obtendrán los datos.
 * @returns {Promise<Array>} Una lista de registros de la tabla especificada.
 */
export async function fetchTableData(tableName) {
    const { data, error } = await supabase.from(tableName).select('*');
    if (error) {
        console.error(`Error al obtener datos de la tabla ${tableName}:`, error);
        throw error;
    }
    return data || [];
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
 * @param {string} metodo_autenticacion - Método usado ('facial' o 'credenciales').
 * @returns {Promise<object>} El resultado de la función del servidor.
 */
export async function requestImmediateAccess(employeeCode, type, details, metodo_autenticacion) {
    const body = {
        codigo_empleado: employeeCode,
        tipo: type,
        details: details,
        metodo_autenticacion: metodo_autenticacion
    };

    console.log("DEBUG: Enviando a request-immediate-access:", body);

    const { data, error } = await supabase.functions.invoke('request-immediate-access', {
        body: body
    });

    if (error) {
        console.error('Error en requestImmediateAccess:', error);
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

/**
 * Obtiene un token de la función de Supabase y luego envía el email desde el cliente.
 * @ADVERTENCIA Este método es inseguro ya que expone credenciales de EmailJS en el cliente.
 * @param {string} code - Legajo del empleado.
 * @param {string} dni - DNI del empleado.
 * @returns {Promise<void>}
 */
export async function sendTokenViaFrontendEmail(code, dni) {
    // 1. Obtener el token y los datos del usuario desde la Edge Function.
    //    La Edge Function debe estar configurada para DEVOLVER estos datos.
    const { data: tokenData, error: tokenError } = await supabase.functions.invoke('send-login-token', {
        body: { code, dni }
    });

    if (tokenError) {
        // Intenta parsear el error para un mensaje más claro.
        try {
            const err = await tokenError.context.json();
            throw new Error(err.error || 'Error al generar el token.');
        } catch (e) {
            throw new Error(tokenError.message || 'Error desconocido al generar el token.');
        }
    }

    // 2. Usar los datos devueltos para enviar el email desde el cliente con EmailJS.
    const emailParams = {
        user_name: tokenData.name,
        login_token: tokenData.token,
        to_email: tokenData.email
    };

    try {
        // Las credenciales de EmailJS (Service ID, Template ID) están expuestas aquí.
        await emailjs.send('service_18gsj8g', 'template_orviue9', emailParams);
    } catch (error) {
        console.error('Error al enviar email con EmailJS desde el cliente:', error);
        // Este error solo se ve si la API de EmailJS falla, no si la Edge Function falla.
        throw new Error('El token se generó, pero falló el envío por email desde el navegador.');
    }
}

/**
 * Verifica el token de inicio de sesión.
 * @param {string} token - El token ingresado por el usuario.
 * @param {string} code - El legajo del empleado.
 * @param {string} dni - El DNI del empleado.
 * @returns {Promise<{user: object}>} El objeto del usuario si el token es válido.
 */
export async function verifyLoginToken(token, code, dni) {
    const { data, error } = await supabase.functions.invoke('verify-login-token', {
        body: { token, code, dni }
    });

    if (error) {
        const err = await error.context.json()
        throw new Error(err.error);
    }
    return data;
}

