import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_CONFIG } from './config.js';

const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

export const getSupabaseClient = () => supabase;

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

async function uploadPhoto(base64Data, employeeCode) {
    const blob = dataURLtoBlob(base64Data);
    const filePath = `empleados/${employeeCode}.png`;
    const { error: uploadError } = await supabase.storage.from('fotos').upload(filePath, blob, { contentType: 'image/png', upsert: true });
    if (uploadError) {
        console.error('Error al subir la foto:', uploadError);
        throw uploadError;
    }
    const { data } = supabase.storage.from('fotos').getPublicUrl(filePath);
    return data.publicUrl;
}

export async function fetchUsers() {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
        console.error('Error al obtener usuarios:', error);
        throw error;
    }
    return data || [];
}

export async function fetchAccessStats() {
    const { data, error } = await supabase.functions.invoke('get-access-stats');
    if (error) {
        console.error('Error al obtener estadísticas de acceso:', error);
        return { credenciales: 0, reconocimiento_facial: 0 };
    }
    return data;
}

export async function fetchAccessRecords() {
    const { data, error } = await supabase.from('access').select('*');
    if (error) {
        console.error('Error al obtener registros de acceso:', error);
        throw error;
    }
    return data || [];
}

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
    const { data, error } = await supabase.from('users').insert([userData]).select().single();
    if (error) {
        console.error('Error al registrar usuario:', error);
        throw error;
    }
    return data;
}

export async function registerAccess(employeeCode, type, metodo_autenticacion, fecha_hora = null) {
    const body = {
        codigo_empleado: employeeCode,
        tipo: type,
        metodo_autenticacion: metodo_autenticacion
    };
    if (fecha_hora) {
        body.fecha_hora = fecha_hora;
    }
    const { data, error } = await supabase.functions.invoke('access', { body: body });
    if (error) {
        console.error('Error al registrar acceso:', error);
        throw error;
    }
    return data;
}

export async function fetchTableData(tableName) {
    const { data, error } = await supabase.from(tableName).select('*');
    if (error) {
        console.error(`Error al obtener datos de la tabla ${tableName}:`, error);
        throw error;
    }
    return data || [];
}

export async function requestImmediateAccess(employeeCode, type, details, metodo_autenticacion) {
    const body = { 
        codigo_empleado: employeeCode, 
        tipo: type, 
        details: details,
        metodo_autenticacion: metodo_autenticacion
    };
    console.log('DEBUG: Enviando a request-immediate-access:', body); // <-- DEBUGGING
    const { data, error } = await supabase.functions.invoke('request-immediate-access', {
        body: body
    });

    if (error && error.context && error.context.status === 409) {
        console.warn('Ya existe una solicitud de autorización pendiente. Se procederá con el acceso provisional.');
        return { status: 'already_pending' };
    }

    if (error) {
        console.error('Error en requestImmediateAccess:', error);
        throw error;
    }

    return data;
}

export async function fetchPendingAuthorizations() {
    const { data, error } = await supabase.from('pending_authorizations').select('*');
    if (error) {
        console.error('Error al obtener autorizaciones pendientes:', error);
        throw error;
    }
    return data || [];
}

export async function resolveAuthorization(recordId, action) {
    const { data, error } = await supabase.functions.invoke('resolve-authorization', { body: { recordId, action } });
    if (error) {
        console.error('Error al resolver la autorización:', error);
        throw error;
    }
    return data;
}

export async function deletePendingAuthorization(recordId) {
    const { error } = await supabase.from('pending_authorizations').delete().eq('id', recordId);
    if (error) {
        console.error('Error al eliminar la autorización pendiente:', error);
    }
}

export async function sendTokenViaFrontendEmail(code, dni) {
    const { data: tokenData, error: tokenError } = await supabase.functions.invoke('send-login-token', { body: { code, dni } });
    if (tokenError) {
        try {
            const err = await tokenError.context.json();
            throw new Error(err.error || 'Error al generar el token.');
        } catch (e) {
            throw new Error(tokenError.message || 'Error desconocido al generar el token.');
        }
    }
    const emailParams = {
        user_name: tokenData.name,
        login_token: tokenData.token,
        to_email: tokenData.email
    };
    try {
        await emailjs.send('service_18gsj8g', 'template_orviue9', emailParams);
    } catch (error) {
        console.error('Error al enviar email con EmailJS desde el cliente:', error);
        throw new Error('El token se generó, pero falló el envío por email desde el navegador.');
    }
}

export async function verifyLoginToken(token, code, dni) {
    const { data, error } = await supabase.functions.invoke('verify-login-token', { body: { token, code, dni } });
    if (error) {
        const err = await error.context.json()
        throw new Error(err.error);
    }
    return data;
}
