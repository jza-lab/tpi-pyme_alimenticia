import { APP_CONSTANTS } from './config.js';
import * as api from './api.js';
import * as face from './face.js';
import * as state from './state.js';
import { initializeStatistics } from './statistics.js';

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
        role: document.getElementById('operator-role'), captureBtn: document.getElementById('capture-btn'),
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
    ['empleados-main-view', 'register-screen', 'capture-screen'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    stopVideoStream();
    document.getElementById(view)?.classList.add('active');

    if (view === 'capture-screen') {
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
        return `
            <tr>
                <td>${new Date(record.fecha_hora).toLocaleString('es-ES')}</td>
                <td>${userName}</td>
                <td>${record.codigo_empleado}</td>
                <td class="tipo-${record.tipo}">${record.tipo}</td>
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

















