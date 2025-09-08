import { APP_CONSTANTS } from './config.js';
import * as api from './api.js';
import * as face from './face.js';
import * as state from './state.js';
import { initializeStatistics, renderCurrentStatsView, destroyCharts } from './statistics.js';
import { t, updateUI } from './i18n-logic.js';

// --- Estado local del menú ---
let currentUser = null;
let faceDescriptor = null;
let detectionInterval = null;

// --- Seguridad y Control de Acceso ---
async function checkAuthAndApplyPermissions() {
  // Forzar la actualización del estado para asegurar que los datos de roles y
  // accesos están siempre actualizados al cargar el menú.
  await state.initState();
  const userCode = sessionStorage.getItem('supervisorCode');

  // --- DEBUGGING ---
  console.log('Verificando menu.js. Código en sessionStorage:', userCode);
  // --- FIN DEBUGGING ---

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
    'btn-carga-manual': document.getElementById('btn-carga-manual'),
  };

  // Ocultar todos los botones de navegación y de acción
  document.querySelectorAll('.nav-btn, .mobile-side-item').forEach(btn => btn.style.display = 'none');
  Object.values(allButtons).forEach(btn => {
    if (btn) btn.style.display = 'none';
  });

  let visibleSections = [];
  let visibleButtons = [];

  switch (nivel_acceso) {
    case USER_LEVELS.GERENTE:
      visibleSections = allSections;
      visibleButtons = ['btn-nuevo-empleado', 'btn-eliminar-empleado', 'btn-carga-manual'];
      break;

    case USER_LEVELS.SUPERVISOR:
      visibleSections = ['accesos', 'empleados', 'autorizaciones', 'estadisticas'];
      visibleButtons = ['btn-carga-manual'];
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

  visibleButtons.forEach(buttonId => {
    if (allButtons[buttonId]) {
      allButtons[buttonId].style.display = 'inline-block';
    }
  });

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
  backToRegisterBtn: document.getElementById('back-to-register'),
  recordsTbody: document.getElementById('records-tbody'),
  peopleInsideCount: document.getElementById('people-inside-count'),
  peopleOutsideCount: document.getElementById('people-outside-count'),
  refreshRecordsBtn: document.getElementById('refresh-records-btn'),
  mobile: {
    openBtn: document.getElementById("mobile-menu-btn"),
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
  },
  manualEntry: {
    legajoInput: document.getElementById('manual-legajo'),
    searchBtn: document.getElementById('manual-search-btn'),
    toggleButtons: document.querySelectorAll('.manual-toggle-btn'),
    btnSubmit: document.getElementById('manual-submit-btn'),
    fechaHoraInput: document.getElementById('manual-fecha-hora'),
    typeError: document.getElementById('manual-type-error'),
    employeeDetailsContainer: document.getElementById('manual-employee-details'),
    employeeName: document.getElementById('manual-employee-name'),
    employeeSurname: document.getElementById('manual-employee-surname'),
    employeeDni: document.getElementById('manual-employee-dni'),
    employeeShift: document.getElementById('manual-employee-shift'),
    employeeRole: document.getElementById('manual-employee-role'),
    employeeAccessLevel: document.getElementById('manual-employee-access-level'),
    employeeNotFoundMsg: document.getElementById('manual-employee-not-found')
  }
};

// --- Gestión de Vistas y Navegación ---
let currentSection = '';

function showSection(sectionId, isMainSection = true) {
    if (currentSection === 'estadisticas' && sectionId !== 'estadisticas') {
        destroyCharts();
    }

    dom.sections.forEach(s => s.classList.remove('active'));
    const sectionElement = document.getElementById(sectionId);
    if (sectionElement) {
        sectionElement.classList.add('active');
    }
    updateUI();

    currentSection = sectionId;

    if (isMainSection) {
        dom.navButtons.forEach(b => b.classList.toggle('active', b.dataset.section === sectionId));
    }

    // Lógica de renderizado específica de la sección
    if (sectionId === 'accesos') renderRecords();
    if (sectionId === 'empleados') renderEmployees();
    if (sectionId === 'autorizaciones') renderAuthorizations();
    if (sectionId === 'estadisticas') renderCurrentStatsView();
}

function initializeManualEntry() {
    let selectedType = null;
    let selectedUser = null;

    const me = dom.manualEntry; // Alias para el sub-objeto del DOM

    function setupDateTimeRestrictions() {
        const now = new Date();
        const maxDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        me.fechaHoraInput.setAttribute('max', maxDateTime);
    }

    function validateDateTime() {
        const selectedDateTime = new Date(me.fechaHoraInput.value);
        if (selectedDateTime > new Date()) {
            alert(t('future_date_error'));
            me.fechaHoraInput.value = '';
            return false;
        }
        return true;
    }

    function clearEmployeeDetails() {
        me.employeeName.textContent = '-';
        me.employeeSurname.textContent = '-';
        me.employeeDni.textContent = '-';
        me.employeeShift.textContent = '-';
        me.employeeRole.textContent = '-';
        me.employeeAccessLevel.textContent = '-';
        me.employeeDetailsContainer.classList.remove('found');
        me.employeeNotFoundMsg.style.display = 'none';
        
        const legajoError = me.legajoInput.closest('.form-group').querySelector('.error-msg');
        if (legajoError) {
            legajoError.classList.remove('show');
        }
    }

    function searchEmployee(legajo) {
        clearEmployeeDetails();
        selectedUser = null;
        if (!legajo) return validateForm();

        const user = state.getUsers().find(u => u.codigo_empleado === legajo);
        if (user) {
            selectedUser = user;
            me.employeeName.textContent = user.nombre || '-';
            me.employeeSurname.textContent = user.apellido || '-';
            me.employeeDni.textContent = user.dni || '-';
            me.employeeShift.textContent = user.turno || '-';
            me.employeeRole.textContent = user.rol || '-';
            me.employeeAccessLevel.textContent = `Nivel ${user.nivel_acceso || '-'}`;
            me.employeeDetailsContainer.classList.add('found');
        } else {
            me.employeeNotFoundMsg.style.display = 'block';
        }
        validateForm();
    }

    function validateForm() {
        const isUserFound = selectedUser !== null;
        const isTypeSelected = selectedType !== null;
        const isDateValid = me.fechaHoraInput.value !== '';

        if (isUserFound && isTypeSelected && isDateValid) {
            me.btnSubmit.disabled = false;
            const typeText = selectedType === 'ingreso' ? t('entry_button') : t('exit_button');
            me.btnSubmit.querySelector('span').textContent = t('register_type_manual_button', { type: typeText });
            me.btnSubmit.classList.remove('disabled');
        } else {
            me.btnSubmit.disabled = true;
            me.btnSubmit.querySelector('span').textContent = t('complete_all_fields');
            me.btnSubmit.classList.add('disabled');
        }
    }

    me.legajoInput.addEventListener('input', () => searchEmployee(me.legajoInput.value.trim()));
    me.searchBtn.addEventListener('click', () => searchEmployee(me.legajoInput.value.trim()));
    me.fechaHoraInput.addEventListener('change', () => {
        validateDateTime();
        validateForm();
    });

    me.toggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            me.toggleButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            selectedType = this.dataset.type;
            me.typeError.classList.remove('show');
            validateForm();
        });
    });

    me.btnSubmit.addEventListener('click', async () => {
        if (!selectedUser || !selectedType || !me.fechaHoraInput.value) {
            alert(t('check_form_errors'));
            return;
        }

        const lastRecord = state.getAccessRecords()
            .filter(r => r.codigo_empleado === selectedUser.codigo_empleado)
            .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))[0];
        const lastStatus = lastRecord ? lastRecord.tipo : 'egreso';

        if (selectedType === lastStatus) {
            alert(t('employee_already_in_status', { name: selectedUser.nombre, status: lastStatus }));
            return;
        }

        try {
            me.btnSubmit.disabled = true;
            me.btnSubmit.querySelector('span').textContent = t('registering');
            const isoDate = new Date(me.fechaHoraInput.value).toISOString();
            await api.registerAccess(selectedUser.codigo_empleado, selectedType, isoDate);
            alert(t('registration_saved_success', { type: selectedType.toUpperCase(), name: selectedUser.nombre, legajo: selectedUser.codigo_empleado }));
            
            // Reset
            me.legajoInput.value = '';
            me.fechaHoraInput.value = '';
            me.toggleButtons.forEach(btn => btn.classList.remove('active'));
            selectedType = null;
            selectedUser = null;
            clearEmployeeDetails();
            validateForm();
            await state.refreshState(); // Forzar la recarga de datos
        } catch (error) {
            alert(t('registration_save_error', { error: error.message }));
        } finally {
            validateForm();
        }
    });

    // Estado inicial del formulario
    clearEmployeeDetails();
    setupDateTimeRestrictions();
    validateForm();
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

    const capitalizedTipo = t(record.tipo);
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

  const roleMap = {
    'Operario': 'role_operator_label',
    'Analista': 'role_analyst_label',
    'Supervisor': 'role_supervisor_label',
    'Gerente': 'role_manager_label'
  };

  dom.employeesList.innerHTML = filteredUsers.map(employee => {
    // Usar el campo 'rol' si existe, de lo contrario, usar la lógica de nivel de acceso como fallback.
    const roleKey = roleMap[employee.rol] || 'role_operator_label';
    const roleText = t(roleKey);
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

/**
 * Valida el formulario de registro de empleados y muestra errores visualmente.
 * @returns {boolean} - Devuelve `true` si el formulario es válido, `false` en caso contrario.
 */
function validateRegistrationForm() {
  const { code, name, surname, dni, email, role, zone, shift } = dom.form;
  let isValid = true;

  // Función para marcar un campo como inválido
  const markInvalid = (field, messageKey) => {
    field.classList.add('is-invalid');
    field.placeholder = t(messageKey);
    isValid = false;
  };

  // Función para limpiar el estado de validación de un campo
  const clearValidation = (field) => {
    field.classList.remove('is-invalid');
    // Restaurar placeholder original si es necesario (se puede guardar en un data-attribute)
  };

  // Limpiar validaciones previas
  Object.values(dom.form).forEach(field => {
    if (field.nodeName === 'INPUT' || field.nodeName === 'SELECT') {
      clearValidation(field);
    }
  });

  // 1. Validar campos requeridos
  const requiredFields = { code, name, surname, dni, email, role, shift };
  for (const [fieldName, field] of Object.entries(requiredFields)) {
    if (!field.value) {
      markInvalid(field, 'field_required');
    }
  }
  const selectedZones = [...zone.options].filter(opt => opt.selected);
  if (selectedZones.length === 0) {
    markInvalid(zone, 'field_required');
  }

  // 2. Validaciones específicas si los campos tienen valor
  if (code.value && state.getUsers().some(u => u.codigo_empleado === code.value)) {
    markInvalid(code, 'employee_code_exists');
  }
  if (dni.value && (dni.value.length < 7 || dni.value.length > 8)) {
    markInvalid(dni, 'dni_length_error');
  }
  if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    markInvalid(email, 'invalid_email_format');
  }
  // Validación para nombre y apellido para que solo contengan letras y espacios
  const textOnlyRegex = /^[A-Za-zÀ-ÿ\s]+$/;
  if (name.value && !textOnlyRegex.test(name.value)) {
    markInvalid(name, 'invalid_name_format');
  }
  if (surname.value && !textOnlyRegex.test(surname.value)) {
    markInvalid(surname, 'invalid_surname_format');
  }

  return isValid;
}


function handleStartCaptureClick() {
  if (!validateRegistrationForm()) {
    alert(t('check_form_errors'));
    return;
  }

  const { code, name, surname, dni, email, role, zone, shift } = dom.form;
  const selectedRole = role.options[role.selectedIndex];
  const selectedZones = [...zone.options]
    .filter(opt => opt.selected)
    .map(opt => opt.value);

  currentUser = {
    codigo_empleado: code.value, nombre: name.value, apellido: surname.value, dni: dni.value, email: email.value,
    nivel_acceso: parseInt(role.value),
    rol: selectedRole.text.split('(')[0].trim(),
    zonas_permitidas: selectedZones,
    turno: shift.value,
    descriptor: null,
    foto: null
  };
  showEmployeeView('capture-screen');
}

async function startFaceCapture() {
  let isCapturing = false; // Flag to prevent multiple captures
  dom.captureStatus.textContent = t('waiting_for_detection');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    dom.video.srcObject = stream;
    await new Promise(resolve => dom.video.onloadedmetadata = () => { dom.video.play(); resolve(); });

    detectionInterval = setInterval(async () => {
      if (!dom.video.srcObject || isCapturing) return;

      const detection = await face.getSingleFaceDetection(dom.video);
      face.drawDetections(dom.video, dom.overlay, detection ? [detection] : []);

      if (detection) {
        const faceMatcher = state.getFaceMatcher();
        const bestMatch = faceMatcher ? faceMatcher.findBestMatch(detection.descriptor) : null;

        if (bestMatch && bestMatch.label !== 'unknown') {
          dom.captureStatus.textContent = t('face_already_registered');
          dom.captureStatus.className = 'status error';
        } else {
          // Rostro válido y no registrado detectado, iniciar captura automática
          isCapturing = true;
          faceDescriptor = detection.descriptor;
          dom.captureStatus.textContent = t('face_detected_capturing');
          dom.captureStatus.className = 'status success';
          
          // Detener el intervalo de detección para evitar más procesamientos
          if (detectionInterval) clearInterval(detectionInterval);
          
          // Esperar un breve momento para que el usuario vea el mensaje y luego capturar
          setTimeout(async () => {
            await confirmCapture();
          }, 1500);
        }
      } else {
        dom.captureStatus.textContent = t('no_single_face_detected');
        dom.captureStatus.className = 'status info';
      }
    }, 500); // Intervalo ligeramente más largo para dar tiempo a la UI
  } catch (err) {
    dom.captureStatus.textContent = t('camera_init_error');
    dom.captureStatus.className = 'status error';
  }
}

async function confirmCapture() {
  if (!faceDescriptor || !currentUser) return;
  dom.captureStatus.textContent = t('processing');

  try {
    // La captura de la imagen se hace aquí para asegurar que es la del momento de la detección
    const canvas = document.createElement('canvas');
    canvas.width = dom.video.videoWidth;
    canvas.height = dom.video.videoHeight;
    canvas.getContext('2d').drawImage(dom.video, 0, 0);

    currentUser.foto = canvas.toDataURL('image/png');
    currentUser.descriptor = Array.from(faceDescriptor);

    const newUser = await api.registerUser(currentUser);
    state.addUser(newUser); // Actualizar el estado local

    alert(t('user_registered_success', { name: newUser.nombre }));
    stopVideoStream();
    showEmployeeView('empleados-main-view');
    renderEmployees(); // Volver a renderizar la lista de empleados
  } catch (error) {
    alert(t('user_registration_error', { error: error.message }));
    // En caso de error, permitir al usuario volver a intentarlo
    stopVideoStream();
    showEmployeeView('register-screen'); // Volver al formulario
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
    showSection(sectionId, true);
    if (document.body.classList.contains('sidebar-open')) {
      document.body.classList.remove("sidebar-open");
    }
  }));

  document.getElementById('btn-nuevo-empleado')?.addEventListener('click', () => showEmployeeView('register-screen'));
  
  // Navegación SPA para Carga Manual
  document.getElementById('btn-carga-manual')?.addEventListener('click', () => showSection('manual-entry', false));
  document.getElementById('back-to-menu-from-manual')?.addEventListener('click', () => showSection('empleados', true));

  dom.form.captureBtn.addEventListener('click', handleStartCaptureClick);
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
    // Limpiar explícitamente la sesión para asegurar un estado limpio
    sessionStorage.removeItem('isSupervisor');
    sessionStorage.removeItem('supervisorCode');
    // Redirigir con un parámetro único para forzar la recarga y evitar el cache
    window.location.replace('index.html?logout=true&t=' + new Date().getTime());
  });

  // Menu responsive
  dom.mobile.openBtn?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
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

  // Inicializar módulos que solo necesitan cargarse una vez
  initializeStatistics(currentUser.zonas_permitidas);
  initializeManualEntry();

  attachListeners();
  // La sección a mostrar por defecto ya se establece en applyRolePermissions

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
        registration.update();
      })
      .catch(err => console.log('ServiceWorker registration failed: ', err));
  }

  try {
    // El estado ya fue inicializado en checkAuth, solo necesitamos cargar modelos de face-api
    await face.loadModels();
    state.initFaceMatcher(); // Cargar el modelo de face-api después de tener los datos
    console.log('Panel de administración inicializado.');

    // Renderizar el contenido inicial de la primera sección visible
    const firstSection = document.querySelector('.nav-btn[style*="display: block"]')?.dataset.section || 'accesos';
    showSection(firstSection);

    updateUI();
  } catch (error) {
    alert(t('panel_load_error', { error: error.message }));
  }
}

window.addEventListener('load', main);
