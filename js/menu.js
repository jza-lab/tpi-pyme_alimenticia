import { APP_CONSTANTS } from './config.js';
import * as api from './api.js';
import * as face from './face.js';
import * as state from './state.js';
import { initializeStatistics } from './statistics.js';

// --- Seguridad---
//  if (sessionStorage.getItem('isSupervisor') !== 'true') {
  //  window.location.replace('index.html');
// }

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
  }
};

// --- Estado local del menú ---
let currentUserData = null;
let faceDescriptor = null;
let detectionInterval = null;

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
      authorizationsList.innerHTML = '<p>No hay autorizaciones pendientes.</p>';
      return;
    }

    authorizationsList.innerHTML = pendingRecords.map(record => {
      const user = userMap.get(record.codigo_empleado);
      const userName = user ? `${user.nombre} ${user.apellido || ''}` : 'Desconocido';
      const localDateTime = new Date(record.created_at).toLocaleString('es-ES');
      
      let detailsHtml = `<p>Motivo: ${record.details?.motivo || 'No especificado'}</p>`;

      if (record.details && record.details.turno_correspondiente) {
        detailsHtml = `
          <div class="authorization-details">
            <p><strong>Turno Asignado:</strong> ${record.details.turno_correspondiente}</p>
            <p><strong>Intento de Ingreso:</strong> ${record.details.turno_intento}</p>
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
            <button class="btn btn-success" data-record-id="${record.id}" data-action="aprobado">Autorizar</button>
            <button class="btn btn-danger" data-record-id="${record.id}" data-action="rechazado">Rechazar</button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners after rendering
    authorizationsList.querySelectorAll('.authorization-actions .btn').forEach(button => {
      button.addEventListener('click', handleAuthorizationAction);
    });

  } catch (error) {
    authorizationsList.innerHTML = '<p class="status error">Error al cargar las autorizaciones.</p>';
    console.error('Error rendering authorizations:', error);
  }
}

async function handleAuthorizationAction(event) {
  const button = event.currentTarget;
  const recordId = button.dataset.recordId;
  const action = button.dataset.action;

  if (!confirm(`¿Está seguro de que desea ${action === 'aprobado' ? 'aprobar' : 'rechazar'} esta solicitud?`)) {
    return;
  }

  try {
    await api.updateAccessStatus(recordId, action);
    const card = document.getElementById(`auth-card-${recordId}`);
    if (card) {
      card.style.transition = 'opacity 0.5s ease';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 500);
    }
    // Opcional: refrescar el estado general para que los cambios se reflejen en otras vistas
    await state.refreshState();
  } catch (error) {
    alert(`Error al ${action === 'aprobado' ? 'aprobar' : 'rechazar'} la solicitud.`);
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
  const records = state.getAccessRecords();
  const users = state.getUsers();
  const userMap = new Map(users.map(u => [u.codigo_empleado, u]));
  const userStatusMap = new Map();
  let peopleInside = 0;

  users.forEach(user => {
    const lastRecord = records.filter(r => r.codigo_empleado === user.codigo_empleado).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))[0];
    const status = lastRecord ? lastRecord.tipo : 'egreso';
    userStatusMap.set(user.codigo_empleado, status);
    if (status === 'ingreso') peopleInside++;
  });

  dom.peopleInsideCount.textContent = peopleInside;
  dom.peopleOutsideCount.textContent = users.length - peopleInside;
  dom.recordsTbody.innerHTML = records.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)).map(record => {
    const user = userMap.get(record.codigo_empleado);
    const userName = user ? `${user.nombre} ${user.apellido || ''}` : 'Desconocido';
    
    const capitalizedTipo = record.tipo.charAt(0).toUpperCase() + record.tipo.slice(1);
    const localDateTime = new Date(record.fecha_hora + 'Z').toLocaleString('es-ES');

    let estadoDisplay;
    let estadoClass;

    switch (record.estado) {
      case 'aprobado':
        // El estado "aprobado" se traduce al estado actual del empleado (Dentro/Fuera)
        const status = userStatusMap.get(record.codigo_empleado) || 'egreso';
        estadoDisplay = status === 'ingreso' ? 'Dentro' : 'Fuera';
        estadoClass = `estado-${status}`;
        break;
      case 'rechazado':
        estadoDisplay = 'Rechazado';
        estadoClass = 'estado-rechazado'; // Necesitará CSS
        break;
      case 'pendiente_autorizacion':
        estadoDisplay = 'Pendiente';
        estadoClass = 'estado-pendiente_autorizacion';
        break;
      default:
        // Lógica fallback para registros sin el campo 'estado'
        const fallbackStatus = userStatusMap.get(record.codigo_empleado) || 'egreso';
        estadoDisplay = fallbackStatus === 'ingreso' ? 'Dentro' : 'Fuera';
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
  dom.employeesList.innerHTML = state.getUsers().map(employee => `
        <div class="employee-card">
            <div class="employee-info">
                <h4>${employee.nombre} ${employee.apellido || ''}</h4>
                <p>Código: ${employee.codigo_empleado} | DNI: ${employee.dni || ''}</p>
            </div>
            <div class="employee-level level-${employee.nivel_acceso || 1}">
                ${employee.nivel_acceso === APP_CONSTANTS.USER_LEVELS.SUPERVISOR ? 'Supervisor' : 'Empleado'}
            </div>
        </div>
    `).join('');
}

// --- Flujo de Registro de Empleados ---
function handleStartCaptureClick() {
  const { code, name, surname, dni, role, zone, shift } = dom.form;
  if (!code.value || !name.value || !surname.value || !dni.value || !role.value || !zone.value || !shift.value) return alert('Complete todos los campos.');
  if (state.getUsers().some(u => u.codigo_empleado === code.value)) return alert('El código de empleado ya existe.');

  currentUserData = {
    codigo_empleado: code.value, nombre: name.value, apellido: surname.value, dni: dni.value,
    nivel_acceso: parseInt(role.value), zonas_permitidas: zone.value, turno: shift.value, descriptor: null, foto: null
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
          dom.captureStatus.textContent = 'Este rostro ya está registrado.';
          dom.confirmCaptureBtn.disabled = true;
        } else {
          dom.captureStatus.textContent = 'Rostro detectado. Puede confirmar.';
          dom.confirmCaptureBtn.disabled = false;
          faceDescriptor = detection.descriptor;
        }
      } else {
        dom.captureStatus.textContent = 'No se detecta un único rostro.';
        dom.confirmCaptureBtn.disabled = true;
      }
    }, 300);
  } catch (err) {
    dom.captureStatus.textContent = 'Error al iniciar la cámara.';
  }
}

async function confirmCapture() {
  if (!faceDescriptor || !currentUserData) return;
  dom.confirmCaptureBtn.disabled = true;
  dom.captureStatus.textContent = 'Procesando...';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = dom.video.videoWidth;
    canvas.height = dom.video.videoHeight;
    canvas.getContext('2d').drawImage(dom.video, 0, 0);

    currentUserData.foto = canvas.toDataURL('image/png');
    currentUserData.descriptor = Array.from(faceDescriptor);

    const newUser = await api.registerUser(currentUserData);
    state.addUser(newUser);

    alert(`Usuario ${newUser.nombre} registrado.`);
    showEmployeeView('empleados-main-view');
    renderEmployees();
  } catch (error) {
    alert('Hubo un error al registrar el usuario.');
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

  // Añadir listener para el botón de logout
  document.querySelector('.logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('isSupervisor');
    window.location.href = 'index.html';
  });

  // Menu responsive
  dom.mobile.openBtn?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
  dom.mobile.closeBtn?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
  dom.mobile.overlay?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
}

async function main() {
  attachListeners();
  showSection('accesos');
  try {
    await Promise.all([face.loadModels(), state.initState()]);
    console.log('Panel de administración inicializado.');
    renderRecords();
    renderEmployees();
    initializeStatistics();
  } catch (error) {
    alert("No se pudo cargar la información del panel: " + error.message);
  }
}

window.addEventListener('load', main);
