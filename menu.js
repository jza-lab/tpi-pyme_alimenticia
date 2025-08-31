const SUPABASE_URL = 'https://xtruedkvobfabctfmyys.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userDatabase = [];
let accessRecords = [];

// ------------------- EVENTOS INICIALES ------------------- //
/**document.addEventListener('DOMContentLoaded', () => {
  const isSupervisor = sessionStorage.getItem('isSupervisor');
  console.log('Menu page loaded. isSupervisor flag:', isSupervisor);

  if (isSupervisor !== 'true') {
    window.location.href = 'index.html';
    return;
  } 

  // Botón salir (esquina superior derecha)
  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('isSupervisor');
      window.location.href = 'index.html';
    });
  }

  // Botón refrescar registros -> ahora llama a refreshRecords que fuerza fetch
  const refreshBtn = document.getElementById('refresh-records');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshRecords);

  // Botón registrar nuevo empleado
  const nuevoEmpleadoBtn = document.getElementById('btn-nuevo-empleado');
  if (nuevoEmpleadoBtn) {
    nuevoEmpleadoBtn.addEventListener('click', () => {
      const operatorCode = prompt("Ingrese código de empleado:");
      const operatorName = prompt("Ingrese nombre:");
      const operatorDni = prompt("Ingrese DNI:");
      const operatorLevel = prompt("Ingrese nivel de acceso:");

      if (!operatorCode || !operatorName || !operatorDni || !operatorLevel) {
        alert('Por favor complete todos los datos.');
        return;
      }

      // Guardamos en sessionStorage para usarlo en la captura
      sessionStorage.setItem('nuevoEmpleado', JSON.stringify({
        codigo_empleado: operatorCode,
        nombre: operatorName,
        dni: operatorDni,
        nivel_acceso: parseInt(operatorLevel),
      }));

      // Redirigir a index en la pantalla de captura
      window.location.href = 'index.html#capture-screen';
    });
  }

  init();
});
*/
    
// Función de logout
    function logout() {
      sessionStorage.removeItem('isSupervisor');
      window.location.href = 'index.html';
    }

    // Navegación entre secciones
    document.addEventListener('DOMContentLoaded', function() {
      // Configurar navegación
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          // Remover clase active de todos los botones
          document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
          // Agregar clase active al botón clickeado
          this.classList.add('active');
          
          // Obtener la sección a mostrar
          const section = this.dataset.section;
          
          // Ocultar todas las secciones
          document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
          
          // Mostrar la sección correspondiente
          const targetSection = document.getElementById(section);
          if (targetSection) {
            targetSection.classList.add('active');
          }
          
          // Actualizar contenido según la sección
          if (section === 'accesos') {
            renderRecords();
          } else if (section === 'empleados') {
            loadEmployees();
          } else if (section === 'estadisticas') {
            loadStatistics();
          }
        });
      });

    document.getElementById('refresh-records')?.addEventListener('click', function() {
        renderRecords();
      });

      // Cargar datos iniciales
      init();
    });

// ------------------- API ------------------- //
async function fetchUsers() {
  try {
    const { data, error } = await supabaseClient.from('users').select('*');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error al cargar usuarios:', err);
    return [];
  }
}

async function fetchAccessRecords() {
  try {
    const { data, error } = await supabaseClient.from('access').select('*');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error al cargar registros de acceso:', err);
    return [];
  }
}

async function init() {
  try {
    userDatabase = await fetchUsers();
    accessRecords = await fetchAccessRecords();
    renderRecords();
  } catch (err) {
      console.error('Error al inicializar:', err);
    }
}

// ------------------- REFRESH ------------------- //
async function refreshRecords() {
  const btn = document.getElementById('refresh-records');
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Actualizando...';
    }
    // Siempre traer datos nuevos desde Supabase
    const [users, records] = await Promise.all([ fetchUsers(), fetchAccessRecords() ]);
    userDatabase = users;
    accessRecords = records;
    renderRecords();
  } catch (err) {
    console.error('Error al refrescar registros:', err);
    alert('No se pudieron actualizar los registros. Reintente.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Actualizar Registros';
    }
  }
}

// ------------------- RENDERIZA (separamos de loadRecords) ------------------- //
function renderRecords() {
  try {
    // Mapear usuarios
    const userMap = {};
    userDatabase.forEach(u => userMap[u.codigo_empleado] = u);

    // Estado actual de cada usuario
    const userStatusMap = {};
    let peopleInside = 0;

    userDatabase.forEach(user => {
      const records = (accessRecords || [])
        .filter(r => r.codigo_empleado === user.codigo_empleado)
        .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

      if (records.length > 0) {
        userStatusMap[user.codigo_empleado] = records[0].tipo;
      } else {
        userStatusMap[user.codigo_empleado] = 'egreso';
      }
    });

    userDatabase.forEach(user => {
      if (userStatusMap[user.codigo_empleado] === 'ingreso') peopleInside++;
    });

    const peopleOutside = Math.max(0, userDatabase.length - peopleInside);

    document.getElementById('people-inside-count').textContent = peopleInside;
    document.getElementById('people-outside-count').textContent = peopleOutside;

    // Tabla de registros
    const tbody = document.getElementById('records-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sortedRecords = (accessRecords || []).slice().sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

    sortedRecords.forEach(record => {
      const user = userMap[record.codigo_empleado];
      const userName = user ? user.nombre : 'Desconocido';
      const fecha = new Date(record.fecha_hora).toLocaleString('es-ES');
      const tipo = record.tipo === 'ingreso' ? 'Ingreso' : 'Egreso';
      const estado = userStatusMap[record.codigo_empleado] === 'ingreso' ? 'Dentro' : 'Fuera';
      const estadoClass = estado === 'Dentro' ? 'status-inside' : 'status-outside';

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
  } catch (err) {
    console.error('Error al renderizar registros:', err);
  }
 console.log('Cargando registros de acceso...');
  document.getElementById('people-inside-count').textContent = '1';
  document.getElementById('people-outside-count').textContent = '1';

  
}

// Función para mostrar lista de empleados
const containerSeccionEmpleados = document.getElementById('empleados-list');

function showEmployeesList(employees) {
  containerSeccionEmpleados.innerHTML = '';

  employees.forEach(employee => {  //CONECTARLO CON TABLA USERS DB
    const card = document.createElement('div');
    card.className = 'employee-card';
    card.innerHTML = `
    <div class="employee-info">
        <h4>${employee.nombre}</h4>
        <p>Código: ${employee.codigo_empleado} | DNI: ${employee.dni}</p>
        <p>Estado: <span class="status-${employee.estado}">${employee.estado === 'inside' ? 'Dentro' : 'Fuera'}</span></p>
    </div>
    <div class="employee-level level-${employee.nivel}">
        ${employee.nivel === 1 ? 'Empleado' : 'Supervisor'}
    </div>
    `;
  containerSeccionEmpleados.appendChild(card);
  });
  }


async function loadEmployees() {
  console.log('Cargando empleados...');
  try {
    // Llamar a fetchUsers para obtener los datos
    const employees = await fetchUsers();

    if (!employees || employees.length === 0) {
      console.warn('No se encontraron empleados');
      container.innerHTML = '<p>No hay empleados para mostrar.</p>';
      return;
    }

    // Renderizar las tarjetas con los datos obtenidos
    showEmployeesList(employees);
  } catch (err) {
    console.error('Error al cargar los empleados:', err);
    container.innerHTML = '<p>Error al cargar los datos.</p>';
  }
}

    async function loadStatistics() {
      console.log('Cargando estadísticas...');
      // Aquí puedes implementar la carga de estadísticas
    }
