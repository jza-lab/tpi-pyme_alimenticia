import { APP_CONSTANTS } from './config.js';
import * as api from './api.js';
import * as face from './face.js';
import * as state from './state.js';
import { initializeStatistics } from './statistics.js';
import { t, updateUI } from './i18n-logic.js';

// --- Estado local del menú ---
let currentUser = null;
let faceDescriptor = null;
let detectionInterval = null;

// --- Seguridad y Control de Acceso ---
async function checkAuthAndApplyPermissions() {
  await state.initState(); // Asegurarse que el estado está inicializado
  const userCode = sessionStorage.getItem('supervisorCode');
  if (!userCode) {
    window.location.replace('index.html');
    return;
  }

  const users = state.getUsers();
  currentUser = users.find(u => u.codigo_empleado === userCode);

  if (!currentUser || currentUser.nivel_acceso === APP_CONSTANTS.USER_LEVELS.OPERARIO) {
    window.location.replace('index.html');
    return;
  }

  applyRolePermissions();
}

function applyRolePermissions() {
  if (!currentUser) return;

  const { nivel_acceso } = currentUser;
  const { USER_LEVELS } = APP_CONSTANTS;

  // Ocultar todo por defecto y luego mostrar según el rol
  const allSections = ['accesos', 'empleados', 'autorizaciones', 'estadisticas'];
  const allButtons = {
    'btn-nuevo-empleado': document.getElementById('btn-nuevo-empleado'),
    'btn-eliminar-empleado': document.getElementById('btn-eliminar-empleado'),
  };

  // Ocultar todos los botones de navegación y de acción
  document.querySelectorAll('.nav-btn, .mobile-side-item').forEach(btn => btn.style.display = 'none');
  Object.values(allButtons).forEach(btn => btn.style.display = 'none');

  let visibleSections = [];

  switch (nivel_acceso) {
    case USER_LEVELS.GERENTE:
      visibleSections = allSections;
      Object.values(allButtons).forEach(btn => btn.style.display = 'inline-block');
      break;

    case USER_LEVELS.SUPERVISOR:
      visibleSections = ['accesos', 'empleados', 'autorizaciones', 'estadisticas'];
      allButtons['btn-eliminar-empleado'].style.display = 'inline-block';
      break;

    case USER_LEVELS.ANALISTA:
      visibleSections = ['estadisticas'];
      break;
  }

  // Mostrar las secciones y botones correspondientes
  visibleSections.forEach(sectionId => {
    document.querySelectorAll(`.nav-btn[data-section="${sectionId}"], .mobile-side-item[data-section="${sectionId}"]`).forEach(btn => {
      btn.style.display = 'block';
    });
  });

  // Activar la primera sección visible por defecto
  if (visibleSections.length > 0) {
    showSection(visibleSections[0]);
  } else {
    // Si un rol no tiene ninguna sección visible (ej. Operario, aunque ya fue redirigido)
    // se ocultan todas las secciones.
    dom.sections.forEach(s => s.classList.remove('active'));
  }
}


// --- Referencias al DOM (cacheadas para eficiencia) ---
const dom = {
  sections: document.querySelectorAll('.content-section'),
  navButtons: document.querySelectorAll('.nav-btn, .mobile-side-item'),
  empleadosMainView: document.getElementById('empleados-main-view'),
  registerScreen: document.getElementById('register-screen'),
  captureScreen: document.getElementById('capture-screen'),
  employeesList: document.getElementById('empleados-list'),
  form: {
    code: document.getElementById('operator-code'), name: document.getElementById('operator-name'),
    surname: document.getElementById('operator-surname'), dni: document.getElementById('operator-dni'),
    email: document.getElementById('operator-email'),
    role: document.getElementById('operator-role'), zone: document.getElementById('operator-zone'),
    shift: document.getElementById('operator-shift'),
    captureBtn: document.getElementById('capture-btn'),
    backToEmployeesBtn: document.getElementById('back-to-employees')
  },
  video: document.getElementById('video'),
  overlay: document.getElementById('overlay'),
  captureStatus: document.getElementById('capture-status'),
  confirmCaptureBtn: document.getElementById('confirm-capture-btn'),
  backToRegisterBtn: document.getElementById('back-to-register'),
  recordsTbody: document.getElementById('records-tbody'),
  peopleInsideCount: document.getElementById('people-inside-count'),
  peopleOutsideCount: document.getElementById('people-outside-count'),
  refreshRecordsBtn: document.getElementById('refresh-records'),
  mobile: {
    openBtn: document.getElementById("mobile-menu-btn"),
    closeBtn: document.getElementById("mobile-sidebar-close"),
    overlay: document.getElementById("mobile-sidebar-overlay")
  },
  filters: {
    name: document.getElementById('filter-by-name'),
    id: document.getElementById('filter-by-id'),
    shift: document.getElementById('filter-by-shift'),
    type: document.getElementById('filter-by-type'),
    date: document.getElementById('filter-by-date'),
    clearBtn: document.getElementById('clear-filters-btn')
  },
  employeeFilters: {
    role: document.getElementById('filter-employee-by-role'),
    shift: document.getElementById('filter-employee-by-shift'),
    menuAccess: document.getElementById('filter-employee-by-menu-access'),
    clearBtn: document.getElementById('clear-employee-filters-btn')
  }
};

// --- Gestión de Vistas y Navegación ---
function showSection(sectionId) {
  dom.sections.forEach(s => s.classList.remove('active'));
  document.getElementById(sectionId)?.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === sectionId));

  if (sectionId === 'accesos') renderRecords();
  if (sectionId === 'empleados') renderEmployees();
  if (sectionId === 'autorizaciones') renderAuthorizations();
}

async function renderAuthorizations() {
  const authorizationsList = document.getElementById('authorizations-list');
  if (!authorizationsList) return;

  try {
    const pendingRecords = await api.fetchPendingAuthorizations();
    const users = state.getUsers();
    const userMap = new Map(users.map(u => [u.codigo_empleado, u]));

    if (pendingRecords.length === 0) {
      authorizationsList.innerHTML = `<p>${t('no_pending_authorizations')}</p>`;
      return;
    }

    authorizationsList.innerHTML = pendingRecords.map(record => {
      const user = userMap.get(record.codigo_empleado);
      const userName = user ? `${user.nombre} ${user.apellido || ''}` : t('unknown_employee');
      const localDateTime = new Date(record.created_at).toLocaleString('es-ES');
      
      let detailsHtml = `<p>${t('authorization_reason', { reason: record.details?.motivo || t('not_specified') })}</p>`;

      if (record.details && record.details.turno_correspondiente) {
        detailsHtml = `
          <div class="authorization-details">
            <p><strong>${t('assigned_shift')}</strong> ${record.details.turno_correspondiente}</p>
            <p><strong>${t('attempted_shift')}</strong> ${record.details.turno_intento}</p>
          </div>
        `;
      }

      return `
        <div class="authorization-card" id="auth-card-${record.id}">
          <div class="auth-card-header">
            <h4>${userName}</h4>
            <span class="auth-card-time">${localDateTime}</span>
          </div>
          <div class="auth-card-body">
            <p>Solicitó: <strong class="access-type ${record.tipo}">${record.tipo}</strong></p>
            ${detailsHtml}
          </div>
          <div class="authorization-actions">
            <button class="btn btn-success" data-record-id="${record.id}" data-action="aprobado">${t('authorize')}</button>
            <button class="btn btn-danger" data-record-id="${record.id}" data-action="rechazado">${t('reject')}</button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners after rendering
    authorizationsList.querySelectorAll('.authorization-actions .btn').forEach(button => {
      button.addEventListener('click', handleAuthorizationAction);
    });

  } catch (error) {
    authorizationsList.innerHTML = `<p class="status error">${t('error_loading_authorizations')}</p>`;
    console.error('Error rendering authorizations:', error);
  }
}

async function handleAuthorizationAction(event) {
  const button = event.currentTarget;
  const recordId = button.dataset.recordId;
  const action = button.dataset.action; // 'aprobado' or 'rechazado'
  const actionText = action === 'aprobado' ? t('approve') : t('reject_verb');

  if (!confirm(t('confirm_authorization_action', { action: actionText }))) {
    return;
  }

  try {
    // Llama a la nueva Edge Function que maneja toda la lógica.
    await api.resolveAuthorization(recordId, action);

    // Forzar la actualización del estado y volver a renderizar la lista
    // para asegurar que la UI está 100% sincronizada con el backend.
    await state.refreshState();
    await renderAuthorizations();
    
  } catch (error) {
    alert(t('authorization_action_error', { action: actionText }));
    console.error('Authorization action failed:', error);
  }
}

function showEmployeeView(view) {
  dom.empleadosMainView.hidden = true;
  dom.registerScreen.classList.remove('active');
  dom.captureScreen.classList.remove('active');

  if (view !== 'capture-screen') {
    stopVideoStream();
  }

  if (view === 'empleados-main-view') {
    dom.empleadosMainView.hidden = false;
  } else if (view === 'register-screen') {
    dom.registerScreen.classList.add('active');
  } else if (view === 'capture-screen') {
    dom.captureScreen.classList.add('active');
    startFaceCapture();
  }
}

// --- Renderizado de Datos ---
function renderRecords() {
  const allRecords = state.getAccessRecords();
  const users = state.getUsers();
  const userMap = new Map(users.map(u => [u.codigo_empleado, u]));

  // Lógica de filtrado
  const nameFilter = dom.filters.name.value.toLowerCase();
  const idFilter = dom.filters.id.value.toLowerCase();
  const shiftFilter = dom.filters.shift.value;
  const typeFilter = dom.filters.type.value;
  const dateFilter = dom.filters.date.value;

  const filteredRecords = allRecords.filter(record => {
    const user = userMap.get(record.codigo_empleado);
    if (!user) return false; // Ocultar registros de usuarios desconocidos

    const userName = `${user.nombre} ${user.apellido || ''}`.toLowerCase();
    const recordDate = record.fecha_hora.split('T')[0]; // Formato YYYY-MM-DD

    const nameMatch = !nameFilter || userName.includes(nameFilter);
    const idMatch = !idFilter || user.codigo_empleado.toLowerCase().includes(idFilter);
    const shiftMatch = !shiftFilter || user.turno === shiftFilter;
    const typeMatch = !typeFilter || record.tipo === typeFilter;
    const dateMatch = !dateFilter || recordDate === dateFilter;

    return nameMatch && idMatch && shiftMatch && typeMatch && dateMatch;
  });


  const userStatusMap = new Map();
  let peopleInside = 0;
  
  // Base status on all records, not filtered ones
  users.forEach(user => {
    const lastRecord = allRecords.filter(r => r.codigo_empleado === user.codigo_empleado).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))[0];
    const status = lastRecord ? lastRecord.tipo : 'egreso';
    userStatusMap.set(user.codigo_empleado, status);
    if (status === 'ingreso') {
      peopleInside++;
    }
  });
  
  // Update counts based on the *original* state, not the filters
  dom.peopleInsideCount.textContent = peopleInside;
  dom.peopleOutsideCount.textContent = users.length - peopleInside;
  dom.recordsTbody.innerHTML = filteredRecords.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)).map(record => {
    const user = userMap.get(record.codigo_empleado);
    const userName = user ? `${user.nombre} ${user.apellido || ''}` : t('unknown_employee');
    
    const capitalizedTipo = record.tipo.charAt(0).toUpperCase() + record.tipo.slice(1);
    const localDateTime = new Date(record.fecha_hora + 'Z').toLocaleString('es-ES');

    let estadoDisplay;
    let estadoClass;

    switch (record.estado) {
      case 'aprobado':
        // El estado "aprobado" se traduce al estado actual del empleado (Dentro/Fuera)
        const status = userStatusMap.get(record.codigo_empleado) || 'egreso';
        estadoDisplay = status === 'ingreso' ? t('status_inside') : t('status_outside');
        estadoClass = `estado-${status}`;
        break;
      case 'rechazado':
        estadoDisplay = t('status_rejected');
        estadoClass = 'estado-rechazado'; // Necesitará CSS
        break;
      case 'pendiente_autorizacion':
        estadoDisplay = t('status_pending');
        estadoClass = 'estado-pendiente_autorizacion';
        break;
      default:
        // Lógica fallback para registros sin el campo 'estado'
        const fallbackStatus = userStatusMap.get(record.codigo_empleado) || 'egreso';
        estadoDisplay = fallbackStatus === 'ingreso' ? t('status_inside') : t('status_outside');
        estadoClass = `estado-${fallbackStatus}`;
    }

    return `
            <tr>
                <td>${localDateTime}</td>
                <td>${userName}</td>
                <td>${record.codigo_empleado}</td>
                <td class="tipo-${record.tipo}">${capitalizedTipo}</td>
                <td class="${estadoClass}">${estadoDisplay}</td>
            </tr>
        `;
  }).join('');
}

function renderEmployees() {
  const users = state.getUsers();
  const { USER_LEVELS } = APP_CONSTANTS;

  // Lógica de filtrado de empleados
  const roleFilter = dom.employeeFilters.role.value;
  const shiftFilter = dom.employeeFilters.shift.value;
  const menuAccessFilter = dom.employeeFilters.menuAccess.value === 'true';

  const filteredUsers = users.filter(user => {
    const roleMatch = !roleFilter || (user.rol || 'Operario') === roleFilter;
    const shiftMatch = !shiftFilter || user.turno === shiftFilter;
    const menuAccessMatch = !menuAccessFilter || user.nivel_acceso >= USER_LEVELS.ANALISTA;

    return roleMatch && shiftMatch && menuAccessMatch;
  });

  dom.employeesList.innerHTML = filteredUsers.map(employee => {
    // Usar el campo 'rol' si existe, de lo contrario, usar la lógica de nivel de acceso como fallback.
    const roleText = employee.rol || t('role_operator');
    // Crear una clase CSS a partir del nombre del rol para poder darle estilos únicos.
    const roleClass = (employee.rol || 'default').toLowerCase().replace(/\s+/g, '-');

    return `
        <div class="employee-card">
            <div class="employee-info">
                <h4>${employee.nombre} ${employee.apellido || ''}</h4>
                <p>${t('employee_code', { code: employee.codigo_empleado, dni: employee.dni || '' })}</p>
            </div>
            <div class="employee-level role-${roleClass}">
                ${roleText}
            </div>
        </div>
    `;
  }).join('');
}

// --- Flujo de Registro de Empleados ---
function handleStartCaptureClick() {
  const { code, name, surname, dni, email, role, zone, shift } = dom.form;

  // --- Validación Robusta ---
  if (!code.value || !name.value || !surname.value || !dni.value || !email.value || !role.value || !zone.value || !shift.value) {
    return alert(t('fill_all_fields'));
  }
  if (state.getUsers().some(u => u.codigo_empleado === code.value)) {
    return alert(t('employee_code_exists'));
  }
  if (dni.value.length < 7 || dni.value.length > 8) {
    return alert(t('dni_length_error'));
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.value)) {
    return alert(t('invalid_email_format'));
  }
  // --- Fin Validación ---

  const selectedRole = dom.form.role.options[dom.form.role.selectedIndex];
  const selectedZones = [...dom.form.zone.options]
    .filter(opt => opt.selected)
    .map(opt => opt.value);

  if (selectedZones.length === 0) {
    return alert(t('fill_all_fields')); // O un mensaje más específico para las zonas
  }

  currentUser = {
    codigo_empleado: code.value, nombre: name.value, apellido: surname.value, dni: dni.value, email: email.value,
    nivel_acceso: parseInt(role.value),
    rol: selectedRole.text.split('(')[0].trim(), // "Analista (Nivel 2)" -> "Analista"
    zonas_permitidas: selectedZones,
    turno: shift.value,
    descriptor: null,
    foto: null
  };
  showEmployeeView('capture-screen');
}

async function startFaceCapture() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    dom.video.srcObject = stream;
    await new Promise(resolve => dom.video.onloadedmetadata = () => { dom.video.play(); resolve(); });

    detectionInterval = setInterval(async () => {
      if (!dom.video.srcObject) return;
      const detection = await face.getSingleFaceDetection(dom.video);
      face.drawDetections(dom.video, dom.overlay, detection ? [detection] : []);

      if (detection) {
        const faceMatcher = state.getFaceMatcher();
        if (faceMatcher && faceMatcher.findBestMatch(detection.descriptor).label !== 'unknown') {
          dom.captureStatus.textContent = t('face_already_registered');
          dom.confirmCaptureBtn.disabled = true;
        } else {
          dom.captureStatus.textContent = t('face_detected_can_confirm');
          dom.confirmCaptureBtn.disabled = false;
          faceDescriptor = detection.descriptor;
        }
      } else {
        dom.captureStatus.textContent = t('no_single_face_detected');
        dom.confirmCaptureBtn.disabled = true;
      }
    }, 300);
  } catch (err) {
    dom.captureStatus.textContent = t('camera_init_error');
  }
}

async function confirmCapture() {
  if (!faceDescriptor || !currentUser) return;
  dom.confirmCaptureBtn.disabled = true;
  dom.captureStatus.textContent = t('processing');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = dom.video.videoWidth;
    canvas.height = dom.video.videoHeight;
    canvas.getContext('2d').drawImage(dom.video, 0, 0);

    currentUser.foto = canvas.toDataURL('image/png');
    currentUser.descriptor = Array.from(faceDescriptor);

    const newUser = await api.registerUser(currentUser);
    state.addUser(newUser);

    alert(t('user_registered_success', { name: newUser.nombre }));
    showEmployeeView('empleados-main-view');
    renderEmployees();
  } catch (error) {
    alert(t('user_registration_error'));
  } finally {
    stopVideoStream();
  }
}

function stopVideoStream() {
  if (detectionInterval) clearInterval(detectionInterval);
  if (dom.video.srcObject) {
    dom.video.srcObject.getTracks().forEach(track => track.stop());
    dom.video.srcObject = null;
  }
}

// --- Inicialización y Event Listeners ---
function attachListeners() {
  dom.navButtons.forEach(btn => btn.addEventListener('click', (e) => {
    const sectionId = e.currentTarget.dataset.section;
    showSection(sectionId);
    // Cierra el menú responsive si se hace clic en un item
    if (document.body.classList.contains('sidebar-open')) {
      document.body.classList.remove("sidebar-open");
    }
  }));

  document.getElementById('btn-nuevo-empleado')?.addEventListener('click', () => showEmployeeView('register-screen'));
  dom.form.captureBtn.addEventListener('click', handleStartCaptureClick);
  dom.confirmCaptureBtn.addEventListener('click', confirmCapture);
  dom.form.backToEmployeesBtn.addEventListener('click', () => showEmployeeView('empleados-main-view'));
  dom.backToRegisterBtn.addEventListener('click', () => showEmployeeView('register-screen'));
  dom.refreshRecordsBtn.addEventListener('click', async () => {
    await state.refreshState();
    renderRecords();
  });

  document.getElementById('refresh-authorizations-btn')?.addEventListener('click', () => {
    renderAuthorizations();
  });

  // Listeners para los filtros del historial de accesos
  dom.filters.name.addEventListener('input', renderRecords);
  dom.filters.id.addEventListener('input', renderRecords);
  dom.filters.shift.addEventListener('change', renderRecords);
  dom.filters.type.addEventListener('change', renderRecords);
  dom.filters.date.addEventListener('change', renderRecords);
  dom.filters.clearBtn.addEventListener('click', () => {
    dom.filters.name.value = '';
    dom.filters.id.value = '';
    dom.filters.shift.value = '';
    dom.filters.type.value = '';
    dom.filters.date.value = '';
    renderRecords();
  });

  // Listeners para los filtros de empleados
  dom.employeeFilters.role.addEventListener('change', renderEmployees);
  dom.employeeFilters.shift.addEventListener('change', renderEmployees);
  dom.employeeFilters.menuAccess.addEventListener('change', renderEmployees);
  dom.employeeFilters.clearBtn.addEventListener('click', () => {
    dom.employeeFilters.role.value = '';
    dom.employeeFilters.shift.value = '';
    dom.employeeFilters.menuAccess.value = '';
    renderEmployees();
  });

  // Añadir listener para el botón de logout
  document.querySelector('.logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('isSupervisor');
    window.location.href = 'index.html';
  });

  // Menu responsive
  dom.mobile.openBtn?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
  dom.mobile.closeBtn?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
  dom.mobile.overlay?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));

  // --- Listeners para validación de inputs en tiempo real ---
  dom.form.dni.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
  });
  dom.form.name.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^A-Za-zÀ-ÿ\s]/g, '');
  });
  dom.form.surname.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^A-Za-zÀ-ÿ\s]/g, '');
  });
  dom.form.code.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  });
}

async function main() {
  // Primero, asegurar que el usuario está autenticado y tiene permisos.
  // Esta función también inicializa el estado y carga los datos del usuario.
  await checkAuthAndApplyPermissions();

  // Si currentUser es nulo, checkAuthAndApplyPermissions ya habrá redirigido.
  if (!currentUser) return;

  attachListeners();
  // La sección a mostrar por defecto ya se establece en applyRolePermissions

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
        registration.update();
      })
      .catch(err => console.log('ServiceWorker registration failed: ', err));
  }

  try {
    // El estado ya fue inicializado en checkAuth, solo necesitamos cargar modelos de face-api
    await face.loadModels();
    console.log('Panel de administración inicializado.');
    
    // Renderizar el contenido inicial
    renderRecords();
    renderEmployees();
    
    // Inicializar estadísticas pasando las zonas permitidas del usuario
    initializeStatistics(currentUser.zonas_permitidas);
    
    updateUI();
  } catch (error) {
    alert(t('panel_load_error', { error: error.message }));
  }
}

window.addEventListener('load', main);
