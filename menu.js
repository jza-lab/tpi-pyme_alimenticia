// menu.js corregido

// Configuración de la API
const API_BASE_URL = 'https://xtruedkvobfabctfmyys.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const { createClient } = supabase;
const supabaseClient = createClient('https://xtruedkvobfabctfmyys.supabase.co', SUPABASE_ANON_KEY);

let userDatabase = [];
let accessRecords = [];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('back-to-home-from-records').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  document.getElementById('refresh-records').addEventListener('click', loadRecords);
  document.getElementById('clear-records-btn').addEventListener('click', clearRecords);
  document.getElementById('reset-users-btn').addEventListener('click', resetUsers);

  document.querySelector('.btn-menu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hide');
  });

  // Logout
  const logoutBtn = document.querySelector('.logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  init();
});

// Funciones de API
async function fetchUsers() {
    try {
        const { data, error } = await supabaseClient.from('users').select('*');
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        return [];
    }
}

async function fetchAccessRecords() {
    try {
        const { data, error } = await supabaseClient.from('access').select('*');
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al cargar registros de acceso:', error);
        return [];
    }
}

async function clearAccessRecords() {
    try {
        const { data, error } = await supabaseClient.functions.invoke('access', { method: 'DELETE' });
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al limpiar registros de acceso:', error);
        throw error;
    }
}

async function clearUsers() {
    try {
        const { data, error } = await supabaseClient.functions.invoke('users', { method: 'DELETE' });
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al limpiar registros:', error);
        throw error;
    }
}

// Inicializar la aplicación
async function init() {
    try {
        // Cargar usuarios y registros de acceso
        userDatabase = await fetchUsers();
        accessRecords = await fetchAccessRecords();
        loadRecords();
    } catch (error) {
        console.error('Error al inicializar la página de menú:', error);
        alert('Error al inicializar la página de menú.');
    }
}

async function loadRecords() {
    try {
        // Usar la variable global si está disponible, sino cargar desde el backend
        if (accessRecords.length === 0) {
            accessRecords = await fetchAccessRecords();
        }
        if (userDatabase.length === 0) {
            userDatabase = await fetchUsers();
        }

        // Crear un mapa de usuarios para acceso rápido
        const userMap = {};
        userDatabase.forEach(user => {
            userMap[user.codigo_empleado] = user;
        });

        // --- Lógica de Contadores Mejorada ---
        let peopleInside = 0;
        const userStatusMap = {};

        // 1. Determinar el estado de cada usuario basado en su último registro
        userDatabase.forEach(user => {
            const userRecords = accessRecords
                .filter(record => record.codigo_empleado === user.codigo_empleado)
                .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

            if (userRecords.length > 0) {
                userStatusMap[user.codigo_empleado] = userRecords[0].tipo; // 'ingreso' o 'egreso'
            } else {
                userStatusMap[user.codigo_empleado] = 'egreso'; // Por defecto, están fuera
            }
        });

        // 2. Contar personas dentro y fuera
        userDatabase.forEach(user => {
            if (userStatusMap[user.codigo_empleado] === 'ingreso') {
                peopleInside++;
            }
        });

        const peopleOutside = userDatabase.length - peopleInside;

        // Actualizar contadores en la UI
        document.getElementById('people-inside-count').textContent = peopleInside;
        document.getElementById('people-outside-count').textContent = peopleOutside;


        // --- Lógica de Tabla ---
        const tbody = document.getElementById('records-tbody');
        tbody.innerHTML = '';

        // Ordenar registros por fecha (más reciente primero)
        const sortedRecords = accessRecords.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

        sortedRecords.forEach(record => {
            const user = userMap[record.codigo_empleado];
            const userName = user ? user.nombre : 'Usuario Desconocido';
            const fecha = new Date(record.fecha_hora).toLocaleString('es-ES');
            const tipo = record.tipo === 'ingreso' ? 'Ingreso' : 'Egreso';
            // Usar el userStatusMap que ya calculamos para la tabla
            const estado = userStatusMap[record.codigo_empleado] === 'ingreso' ? 'Dentro' : 'Fuera';
            const estadoClass = userStatusMap[record.codigo_empleado] === 'ingreso' ? 'status-inside' : 'status-outside';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${fecha}</td>
                <td>${userName}</td>
                <td>${record.codigo_empleado}</td>
                <td>${tipo}</td>
                <td class="${estadoClass}">${estado}</td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error al cargar registros:', error);
        alert('Error al cargar los registros. Por favor, intente nuevamente.');
    }
}

// Función para limpiar todos los registros
async function clearRecords() {
    const confirmation = confirm('¿Está seguro de que desea eliminar todos los registros de acceso? Esta acción no se puede deshacer.');

    if (confirmation) {
        try {
            await clearAccessRecords();

            // Limpiar la lista local
            accessRecords = [];

            // Volver a cargar la vista de registros (que ahora estará vacía)
            loadRecords();

            alert('Todos los registros de acceso han sido eliminados.');
        } catch (error) {
            console.error('Error al limpiar los registros:', error);
            alert('Hubo un error al intentar limpiar los registros. Por favor, intente nuevamente.');
        }
    }
}

// Función para reiniciar la base de datos de usuarios
async function resetUsers() {
    const confirmation = confirm('¿ESTÁ SEGURO DE QUE DESEA ELIMINAR A TODOS LOS USUARIOS? Esta acción es irreversible y también limpiará todos los registros de acceso.');

    if (confirmation) {
        try {
            // Primero limpiar registros, luego usuarios, para evitar registros huérfanos si algo falla
            await clearAccessRecords();
            await clearUsers();

            // Limpiar las listas locales
            accessRecords = [];
            userDatabase = [];

            // Volver a cargar la vista de registros (que ahora estará vacía)
            loadRecords();

            alert('Todos los usuarios y registros de acceso han sido eliminados.');
        } catch (error) {
            console.error('Error al reiniciar la base de datos:', error);
            alert('Hubo un error al intentar reiniciar la base de datos. Por favor, intente nuevamente.');
        }
    }
}
