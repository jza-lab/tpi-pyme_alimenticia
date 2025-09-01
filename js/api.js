//import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_CONFIG } from './config.js';

// Inicializar el cliente de Supabase una sola vez
const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

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

export async function fetchUsers() {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
        console.error('Error al obtener usuarios:', error);
        throw error;
    }
    return data || [];
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
