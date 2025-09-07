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
 * @deprecated La lógica ahora se maneja en el cliente con getTokenAndSendEmail.
 * Envía un token de inicio de sesión al empleado usando una Edge Function.
 * @note La función del servidor se encarga de generar el token y enviarlo por email/SMS.
 * @param {string} code - Legajo del empleado.
 * @param {string} dni - DNI del empleado.
 * @returns {Promise<void>}
 */
export async function sendLoginToken(code, dni) {
    const { data, error } = await supabase.functions.invoke('send-login-token', {
        body: { code, dni }
    });

    if (error) {
        const err = await error.context.json()
        throw new Error(err.error);
    }
    return data;
}

/**
 * NUEVA FUNCIÓN CON EMAILJS
 * Obtiene un token de la función de Supabase y lo envía por correo usando EmailJS.
 * @param {string} userCode - El código del empleado.
 * @param {string} userDni - El DNI del empleado.
 * @returns {Promise<void>}
 */
export async function getTokenAndSendEmail(userCode, userDni) {
  const SUPABASE_FUNCTION_URL = "https://xtruedkvobfabctfmyys.supabase.co/functions/v1/send-login-token"; 
  const EMAILJS_PUBLIC_KEY = "JCioEYp4izZHGAoHd";
  const EMAILJS_SERVICE_ID = "service_18gsj8g";
  const EMAILJS_TEMPLATE_ID = "template_orviue9";

  // EmailJS ya debería estar inicializado en app.js, pero lo hacemos aquí por seguridad.
  // En una app más grande, esto se haría en un punto de entrada único.
  if (typeof emailjs === 'undefined') {
    console.error("EmailJS SDK no está cargado.");
    throw new Error("EmailJS SDK no está cargado.");
  }
  
  // No es necesario inicializarlo en cada llamada si ya se hizo globalmente.
  // emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

  console.log("Solicitando token a Supabase...");
  const response = await fetch(SUPABASE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'apikey': SUPABASE_CONFIG.ANON_KEY // La anon key es necesaria si la función no es 'public'
    },
    body: JSON.stringify({ code: userCode, dni: userDni })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Error al generar el token.');
  }
  
  console.log("Token recibido. Enviando email con EmailJS...");

  const templateParams = {
    // to_email: data.email, // EmailJS no usa 'to_email' aquí, se configura en la plantilla
    user_name: data.name,
    login_token: data.token,
    to_email: data.email
  };

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
    // No devolvemos nada, el manejo de UI se hace en app.js
  } catch (error) {
    console.error('Error al enviar email con EmailJS:', error);
    // Re-lanzamos el error para que el llamador (en app.js) pueda manejarlo
    throw new Error('Hubo un problema al enviar el correo con el token.');
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

