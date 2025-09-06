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
    const status = userStatusMap.get(record.codigo_empleado) || 'egreso';
    // Capitaliza la primera letra del tipo de acceso para una mejor presentación.
    const capitalizedTipo = record.tipo.charAt(0).toUpperCase() + record.tipo.slice(1);

    // Asegura que la fecha de la base de datos (asumida como UTC) se interprete como tal
    // y luego se convierta a la zona horaria local del usuario.
    const localDateTime = new Date(record.fecha_hora + 'Z').toLocaleString('es-ES');

    return `
            <tr>
                <td>${localDateTime}</td>
                <td>${userName}</td>
                <td>${record.codigo_empleado}</td>
                <td class="tipo-${record.tipo}">${capitalizedTipo}</td>
                <td class="estado-${status}">${status === 'ingreso' ? 'Dentro' : 'Fuera'}</td>
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
  const { code, name, surname, dni, role, zone } = dom.form;
  if (!code.value || !name.value || !surname.value || !dni.value || !role.value || !zone.value) return alert('Complete todos los campos.');
  if (state.getUsers().some(u => u.codigo_empleado === code.value)) return alert('El código de empleado ya existe.');

  currentUserData = {
    codigo_empleado: code.value, nombre: name.value, apellido: surname.value, dni: dni.value,
    nivel_acceso: parseInt(role.value), zonas_permitidas: zone.value, descriptor: null, foto: null
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

// --- Validaciones de Inputs ---

document.getElementById("operator-surname").addEventListener("input", function () {
    this.value = this.value.replace(/[^A-Za-zÀ-ÿ\s]/g, "");
});
document.getElementById("operator-name").addEventListener("input", function () {
    this.value = this.value.replace(/[^A-Za-zÀ-ÿ\s]/g, "");
});
document.getElementById("operator-dni").addEventListener("input", function () {
    this.value = this.value.replace(/[^0-9]/g, "");
});




// Limpieza del formulario al volver a la vista de empleados

// Esperar a que el DOM cargue
document.addEventListener("DOMContentLoaded", () => {
  const backButton = document.getElementById("back-to-employees");

  backButton.addEventListener("click", () => {
    limpiarFormulario();
  });
});

function limpiarFormulario() {
  // Selecciona todos los inputs y selects dentro del div "register-screen"
  let inputs = document.querySelectorAll('#register-screen input, #register-screen select');
  
  inputs.forEach(el => {
    if (el.tagName === "SELECT") {
      el.selectedIndex = 0; // vuelve a la primera opción
    } else {
      el.value = ""; // limpia el texto
    }
  });
}