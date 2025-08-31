const SUPABASE_URL = 'https://xtruedkvobfabctfmyys.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userDatabase = [];
let accessRecords = [];
let faceMatcher = null;
let currentUser = null;
let faceDescriptor = null;
let detectionInterval = null;

// Referencias a elementos
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const captureStatus = document.getElementById('capture-status');




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
document.addEventListener('DOMContentLoaded', function () {
  // Configurar navegación
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function () {
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

  // Configurar botones de empleados
  document.getElementById('btn-nuevo-empleado')?.addEventListener('click', function () {
    showRegisterScreen();
  });

  document.getElementById('btn-eliminar-empleado')?.addEventListener('click', function () {
    const codigo = prompt("Ingrese el código del empleado a eliminar:");
    if (codigo) {
      // Aquí implementarías la lógica para eliminar empleado
      alert('Funcionalidad de eliminar empleado en desarrollo');
    }
  });

  // Configurar botones de las pantallas de registro
  document.getElementById('back-to-employees')?.addEventListener('click', function () {
    showEmployeesMainView();
  });

  document.getElementById('capture-btn')?.addEventListener('click', function () {
    // Validar formulario antes de ir a captura
    const code = document.getElementById('operator-code').value.trim();
    const name = document.getElementById('operator-name').value.trim();
    const surname = document.getElementById('operator-surname').value.trim();
    const dni = document.getElementById('operator-dni').value.trim();
    const role = document.getElementById('operator-role').value;

    if (!code || !name || !surname || !dni || !role) {
      alert('Por favor complete todos los campos.');
      return;
    }

    // Verificar si el código ya existe
    if (userDatabase.find(u => u.codigo_empleado === code)) {
      alert('Código ya registrado.');
      return;
    }

    // Guardar datos del usuario actual
    currentUser = {
      codigo_empleado: code,
      nombre: name,
      apellido: surname,
      dni: dni,
      nivel_acceso: parseInt(role),
      foto: '',
      descriptor: null
    };

    showCaptureScreen();
  });

  document.getElementById('back-to-register')?.addEventListener('click', function () {
    showRegisterScreen();
  });

  document.getElementById('retry-capture-btn')?.addEventListener('click', function () {
    // Reiniciar captura
    document.getElementById('capture-status').textContent = 'Esperando detección facial...';
    document.getElementById('capture-status').className = 'status info';
    document.getElementById('confirm-capture-btn').disabled = true;
  });

  document.getElementById('confirm-capture-btn')?.addEventListener('click', function () {
    // Aquí implementarías la lógica para confirmar y guardar
    alert('Empleado registrado exitosamente');
    showEmployeesMainView();
    // Limpiar formulario
    clearRegistrationForm();
  });

  document.getElementById('refresh-records')?.addEventListener('click', function () {
    renderRecords();
  });

  // Cargar datos iniciales
  init();
});

// Funciones para cargar datos (adaptadas a tu código original)
async function fetchUsers() {
  try {
    // Simular carga desde Supabase - reemplaza con tu código original
    return [
      { codigo_empleado: 'EMP001', nombre: 'Juan Pérez', dni: '12345678', nivel_acceso: 1 },
      { codigo_empleado: 'EMP002', nombre: 'María García', dni: '87654321', nivel_acceso: 3 }
    ];
  } catch (err) {
    console.error('Error al cargar usuarios:', err);
    return [];
  }
}

async function fetchAccessRecords() {
  try {
    // Simular registros de acceso - reemplaza con tu código original
    return [
      { fecha_hora: new Date().toISOString(), codigo_empleado: 'EMP001', tipo: 'ingreso' },
      { fecha_hora: new Date(Date.now() - 3600000).toISOString(), codigo_empleado: 'EMP002', tipo: 'egreso' }
    ];
  } catch (err) {
    console.error('Error al cargar registros:', err);
    return [];
  }
}

document.getElementById('confirm-capture-btn')?.addEventListener('click', function () {
  confirmCapture();
});

document.getElementById('refresh-records')?.addEventListener('click', function () {
  refreshRecords();
});

// ------------------- API FUNCTIONS ------------------- //
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

// ------------------- INIT ------------------- //
async function init() {
  try {
    console.log('Cargando modelos face-api...');
    const MODEL_BASE_URL = '/tpi-pyme_alimenticia/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_BASE_URL}/tiny_face_detector`);
    await faceapi.nets.faceLandmark68Net.loadFromUri(`${MODEL_BASE_URL}/face_landmark_68`);
    await faceapi.nets.faceRecognitionNet.loadFromUri(`${MODEL_BASE_URL}/face_recognition`);
    try {
      await faceapi.nets.faceExpressionNet.loadFromUri(`${MODEL_BASE_URL}/face_expression`);
    } catch (e) {
      console.log('Face expression model not found, continuing...');
    }

    userDatabase = await fetchUsers();
    accessRecords = await fetchAccessRecords();
    updateFaceMatcher();
    renderRecords();
    console.log('Init OK');
  } catch (err) {
    console.error('init error', err);
    alert('Error al cargar los modelos de reconocimiento facial');
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
    const [users, records] = await Promise.all([fetchUsers(), fetchAccessRecords()]);
    userDatabase = users;
    accessRecords = records;
    updateFaceMatcher();
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

// ------------------- RENDER RECORDS ------------------- //
function renderRecords() {
  try {
    const userMap = {};
    userDatabase.forEach(u => userMap[u.codigo_empleado] = u);

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

    const tbody = document.getElementById('records-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sortedRecords = (accessRecords || []).slice().sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

    sortedRecords.forEach(record => {
      const user = userMap[record.codigo_empleado];
      const userName = user ? `${user.nombre} ${user.apellido || ''}` : 'Desconocido';
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
}

async function loadEmployees() {
  showEmployeesMainView();
  try {
    const employees = await fetchUsers();
    if (!employees || employees.length === 0) {
      console.warn('No se encontraron empleados');
      document.getElementById('empleados-list').innerHTML = '<p>No hay empleados para mostrar.</p>';
      return;
    }
    showEmployeesList(employees);
  } catch (err) {
    console.error('Error al cargar los empleados:', err);
    document.getElementById('empleados-list').innerHTML = '<p>Error al cargar los datos.</p>';
  }
}

function showEmployeesList(employees) {
  const container = document.getElementById('empleados-list');
  container.innerHTML = '';

  employees.forEach(employee => {
    const card = document.createElement('div');
    card.className = 'employee-card';
    card.innerHTML = `
          <div class="employee-info">
            <h4>${employee.nombre} ${employee.apellido || ''}</h4>
            <p>Código: ${employee.codigo_empleado} | DNI: ${employee.dni}</p>
            <p>Estado: <span class="status-inside">Activo</span></p>
          </div>
          <div class="employee-level level-${employee.nivel_acceso}">
            ${employee.nivel_acceso === 1 ? 'Empleado' : 'Supervisor'}
          </div>
        `;
    container.appendChild(card);
  });
}

async function loadStatistics() {
  console.log('Cargando estadísticas...');
  // Aquí puedes implementar la carga de estadísticas
}

// ------------------- SCREEN MANAGEMENT ------------------- //
function showEmployeesMainView() {
  document.getElementById('empleados-main-view').style.display = 'block';
  document.getElementById('register-screen').classList.remove('active');
  document.getElementById('capture-screen').classList.remove('active');
  stopVideoStream();
}

function showRegisterScreen() {
  document.getElementById('empleados-main-view').style.display = 'none';
  document.getElementById('register-screen').classList.add('active');
  document.getElementById('capture-screen').classList.remove('active');
  stopVideoStream();
}

function showCaptureScreen() {
  document.getElementById('empleados-main-view').style.display = 'none';
  document.getElementById('register-screen').classList.remove('active');
  document.getElementById('capture-screen').classList.add('active');
  initCamera();
}

function clearRegistrationForm() {
  document.getElementById('operator-code').value = '';
  document.getElementById('operator-name').value = '';
  document.getElementById('operator-surname').value = '';
  document.getElementById('operator-dni').value = '';
  document.getElementById('operator-role').value = '';
}

// ------------------- CAMERA AND FACE DETECTION ------------------- //
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }
    });
    video.srcObject = stream;

    await new Promise(resolve => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });

    const displaySize = {
      width: video.clientWidth || video.offsetWidth,
      height: video.clientHeight || video.offsetHeight
    };

    overlay.width = displaySize.width;
    overlay.height = displaySize.height;
    overlay.style.width = `${displaySize.width}px`;
    overlay.style.height = `${displaySize.height}px`;

    captureStatus.textContent = 'Cámara lista. Esperando detección facial...';
    captureStatus.className = 'status info';

    detectFaceForRegistration();
  } catch (err) {
    console.error('Error al inicializar cámara:', err);
    captureStatus.textContent = 'Error: No se pudo acceder a la cámara.';
    captureStatus.className = 'status error';
  }
}

function detectFaceForRegistration() {
  if (detectionInterval) clearInterval(detectionInterval);

  detectionInterval = setInterval(async () => {
    if (!video || !video.clientWidth || !video.clientHeight) return;

    try {
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      const displaySize = {
        width: video.clientWidth || video.offsetWidth,
        height: video.clientHeight || video.offsetHeight
      };

      if (overlay.width !== displaySize.width || overlay.height !== displaySize.height) {
        overlay.width = displaySize.width;
        overlay.height = displaySize.height;
        overlay.style.width = `${displaySize.width}px`;
        overlay.style.height = `${displaySize.height}px`;
      }

      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      if (detections.length > 0) {
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(overlay, resizedDetections);
        faceapi.draw.drawFaceLandmarks(overlay, resizedDetections);
      }

      if (detections.length === 1) {
        captureStatus.textContent = 'Rostro detectado. Confirme la captura.';
        captureStatus.className = 'status success';
        document.getElementById('confirm-capture-btn').disabled = false;
        faceDescriptor = detections[0].descriptor;
      } else {
        document.getElementById('confirm-capture-btn').disabled = true;
        faceDescriptor = null;
        if (detections.length > 1) {
          captureStatus.textContent = 'Se detectó más de un rostro. Asegúrese de que solo haya una persona.';
          captureStatus.className = 'status error';
        } else {
          captureStatus.textContent = 'No se detectó rostro.';
          captureStatus.className = 'status info';
        }
      }
    } catch (err) {
      console.error('Error en detección facial:', err);
    }
  }, 200);
}

// ------------------- REGISTRATION ------------------- //
async function registerUser(userData) {
  try {
    const { data, error } = await supabaseClient.from('users').insert([{
      codigo_empleado: userData.codigo_empleado,
      nombre: userData.nombre,
      apellido: userData.apellido,
      dni: userData.dni,
      nivel_acceso: userData.nivel_acceso,
      descriptor: userData.descriptor,
      foto: userData.foto
    }]);

    if (error) throw error;
    return { user: userData };
  } catch (err) {
    console.error('Error al registrar usuario:', err);
    throw err;
  }
}

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

async function uploadPhoto(base64Data, filename) {
  const blob = dataURLtoBlob(base64Data);

  const { data, error } = await supabaseClient
    .storage
    .from('fotos')
    .upload(`empleados/${filename}.png`, blob, {
      contentType: 'image/png',
      upsert: true
    });

  if (error) {
    console.error('Error al subir foto:', error);
    throw error;
  }

  // Obtener URL pública
  const { data: publicUrlData } = supabaseClient
    .storage
    .from('fotos')
    .getPublicUrl(`empleados/${filename}.png`);

  return publicUrlData.publicUrl;
}


async function confirmCapture() {
  if (!faceDescriptor) {
    alert('No hay descriptor facial.');
    return;
  }
  // Verificar si el rostro ya existe
  if (faceMatcher) {
    const bestMatch = faceMatcher.findBestMatch(faceDescriptor);
    if (bestMatch.distance < 0.6) {
      const existingUser = userDatabase.find(u => u.codigo_empleado === bestMatch.label);
      const userName = existingUser ? `${existingUser.nombre} ${existingUser.apellido || ''}`.trim() : 'un usuario existente';
      alert(`Este rostro ya está registrado para ${userName} (código: ${bestMatch.label}). No se puede registrar un mismo rostro para múltiples empleados.`);
      return; // Detener el proceso de registro
    }
  }

  try {
    currentUser.descriptor = Array.from(faceDescriptor);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const fotoBase64 = canvas.toDataURL('image/png');

    // Subir foto al bucket y obtener URL pública
    const fotoUrl = await uploadPhoto(fotoBase64, currentUser.codigo_empleado);
    currentUser.foto = fotoUrl;

    // Registrar en la tabla
    const result = await registerUser(currentUser);
    if (result?.user) {
      userDatabase.push(result.user);
    }

    updateFaceMatcher();
    stopVideoStream();
    alert(`Usuario ${currentUser.nombre} ${currentUser.apellido} registrado exitosamente.`);
    clearRegistrationForm();
    showEmployeesMainView();
    loadEmployees(); // Recargar lista
  } catch (err) {
    console.error('Error al confirmar captura:', err);
    alert('Error al registrar usuario.');
  }
}


// ------------------- UTILITY FUNCTIONS ------------------- //
function stopVideoStream() {
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  if (overlay && overlay.getContext) {
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
  }
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
}

function updateFaceMatcher() {
  if (!userDatabase || userDatabase.length === 0) {
    faceMatcher = null;
    return;
  }

  const labeled = userDatabase.map(u => {
    if (u.descriptor && u.descriptor.length) {
      return new faceapi.LabeledFaceDescriptors(
        u.codigo_empleado,
        [new Float32Array(u.descriptor)]
      );
    }
    return null;
  }).filter(Boolean);

  if (labeled.length) {
    faceMatcher = new faceapi.FaceMatcher(labeled, 0.6);
  } else {
    faceMatcher = null;
  }
}