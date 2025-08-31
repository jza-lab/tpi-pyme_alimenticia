/* -------------------------
   CONFIG - Supabase client
   ------------------------- */
const SUPABASE_URL = 'https://xtruedkvobfabctfmyys.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo';
let supabaseClient = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
  const { createClient } = supabase;
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error('Supabase JS no está disponible. Verificá que el script de supabase se cargue antes de menu.js.');
}

/* -------------------------
   Estado global
   ------------------------- */
let userDatabase = [];
let accessRecords = [];
let faceMatcher = null;
let currentUser = null;
let faceDescriptor = null;
let detectionInterval = null;
let statsChartInstance = null;

/* -------------------------
   Referencias a elementos DOM (se buscan en load)
   ------------------------- */
let video, overlay, captureStatus;

/* -------------------------
   DOMContentLoaded: configuración UI
   ------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  video = document.getElementById('video');
  overlay = document.getElementById('overlay');
  captureStatus = document.getElementById('capture-status');

  setupNav();
  setupButtons();
  setDefaultView();
  startAppInit();
  setupSidebar();
  // iniciar carga de datos y modelos (no bloqueantes entre sí)
  startAppInit();
});

/* -------------------------
   UI: Navegación y responsive
   ------------------------- */
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      const section = this.dataset.section;
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      const targetSection = document.getElementById(section);
      if (targetSection) targetSection.classList.add('active');

      if (section === 'accesos') renderRecords();
      if (section === 'empleados') loadEmployees();
      if (section === 'estadisticas') loadStatistics();
    });
  });
}

function setupSidebar() {
  const openBtn = document.getElementById("mobile-menu-btn");
  const closeBtn = document.getElementById("mobile-sidebar-close");
  const overlay = document.getElementById("mobile-sidebar-overlay");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      document.body.classList.add("sidebar-open");
      openBtn.setAttribute("aria-expanded", "true");
    });
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    if (openBtn) openBtn.setAttribute("aria-expanded", "false");
  }

  if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // al hacer clic en un item de la sidebar -> navega + cierra
  document.querySelectorAll(".mobile-side-item").forEach(item => {
    item.addEventListener("click", () => {
      const section = item.dataset.section;

      // limpiar clases
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));

      // activar la sección correspondiente
      const targetSection = document.getElementById(section);
      if (targetSection) targetSection.classList.add('active');

      // marcar también el botón principal como activo (coherencia)
      const mainBtn = document.querySelector(`.nav-btn[data-section="${section}"]`);
      if (mainBtn) mainBtn.classList.add('active');

      // llamar a funciones asociadas
      if (section === 'accesos') renderRecords();
      if (section === 'empleados') loadEmployees();
      if (section === 'estadisticas') loadStatistics();

      // cerrar el sidebar
      closeSidebar();
    });
  });

}

function setDefaultView() {
  const accesosSection = document.getElementById('accesos');
  const accesosBtn = document.querySelector('[data-section="accesos"]');
  if (accesosSection && accesosBtn) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    accesosSection.classList.add('active');
    accesosBtn.classList.add('active');
  }
}

/* -------------------------
   Botones (registro, refresh, registro/captura)
   ------------------------- */
function setupButtons() {
  document.getElementById('btn-nuevo-empleado')?.addEventListener('click', showRegisterScreen);
  document.getElementById('btn-eliminar-empleado')?.addEventListener('click', async () => {
    const codigo = prompt("Ingrese el código del empleado a eliminar:");
    if (codigo) {
      alert('Funcionalidad eliminar en desarrollo — puedo implementarla si querés.');
    }
  });

  document.getElementById('back-to-employees')?.addEventListener('click', showEmployeesMainView);
  document.getElementById('capture-btn')?.addEventListener('click', handleCaptureBtn);
  document.getElementById('back-to-register')?.addEventListener('click', showRegisterScreen);
  document.getElementById('retry-capture-btn')?.addEventListener('click', () => {
    document.getElementById('capture-status').textContent = 'Esperando detección facial...';
    document.getElementById('capture-status').className = 'status info';
    document.getElementById('confirm-capture-btn').disabled = true;
  });
  document.getElementById('confirm-capture-btn')?.addEventListener('click', confirmCapture);
  document.getElementById('refresh-records')?.addEventListener('click', refreshRecords);
}

/* -------------------------
   Inicialización: datos y modelos en paralelo
   ------------------------- */
async function startAppInit() {
  try {
    // Inicio paralelo: primero traemos datos (no dependemos de modelos)
    const usersPromise = fetchUsers().catch(err => {
      console.error('fetchUsers fallo: ', err);
      return [];
    });
    const recordsPromise = fetchAccessRecords().catch(err => {
      console.error('fetchAccessRecords fallo: ', err);
      return [];
    });

    // También intentamos cargar modelos (no bloqueante para la UI)
    loadFaceModels().catch(err => {
      console.warn('Carga de modelos face-api falló (no crítico para ver empleados):', err);
    });

    // Esperamos datos y luego actualizamos UI
    const [users, records] = await Promise.all([usersPromise, recordsPromise]);
    userDatabase = users || [];
    accessRecords = records || [];

    updateFaceMatcher(); // usa userDatabase (si hay descriptors)
    renderRecords(); // actualiza la sección de accesos (conteos)
    console.log('Datos iniciales cargados: usuarios=', userDatabase.length, 'registros=', accessRecords.length);

  } catch (err) {
    console.error('Error en startAppInit:', err);
  }
}

/* -------------------------
   Carga de modelos face-api (opcional, no bloqueante)
   ------------------------- */
async function loadFaceModels() {
  try {
    if (typeof faceapi === 'undefined') {
      throw new Error('face-api no está cargado');
    }
    console.log('Cargando modelos face-api...');
    const MODEL_BASE_URL = '/tpi-pyme_alimenticia/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_BASE_URL}/tiny_face_detector`);
    await faceapi.nets.faceLandmark68Net.loadFromUri(`${MODEL_BASE_URL}/face_landmark_68`);
    await faceapi.nets.faceRecognitionNet.loadFromUri(`${MODEL_BASE_URL}/face_recognition`);
    try {
      await faceapi.nets.faceExpressionNet.loadFromUri(`${MODEL_BASE_URL}/face_expression`);
    } catch (e) {
      console.log('Face expression model no encontrado (no crítico).');
    }
    console.log('Modelos face-api cargados (siempre que existan los archivos).');
  } catch (err) {
    console.warn('No se pudieron cargar modelos face-api (seguiré sin ellos):', err);
    // no re-lanzo: la app sigue funcionando sin modelos
  }
}

/* -------------------------
   Refresh records
   ------------------------- */
async function refreshRecords() {
  const btn = document.getElementById('refresh-records');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Actualizando...'; }
    const [users, records] = await Promise.all([fetchUsers(), fetchAccessRecords()]);
    userDatabase = users;
    accessRecords = records;
    updateFaceMatcher();
    renderRecords();
  } catch (err) {
    console.error('Error al refrescar registros:', err);
    alert('No se pudieron actualizar los registros. Reintente.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Actualizar Registros'; }
  }
}

/* -------------------------
   Render de registros y conteos
   ------------------------- */
function renderRecords() {
  try {
    // Si no tenemos users, mostrar aviso en UI
    if (!userDatabase || userDatabase.length === 0) {
      document.getElementById('people-inside-count').textContent = '0';
      document.getElementById('people-outside-count').textContent = '0';
      document.getElementById('records-tbody').innerHTML = '<tr><td colspan="5">No hay empleados cargados (ver consola para errores o revisar permisos/tabla en Supabase).</td></tr>';
      console.warn('userDatabase vacío: revisá fetchUsers(), RLS o el nombre de la tabla en Supabase.');
      return;
    }

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
    if (sortedRecords.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No hay registros de acceso.</td></tr>';
    } else {
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
    }
  } catch (err) {
    console.error('Error al renderizar registros:', err);
  }
}

/* -------------------------
   Empleados: listar y mostrar
   ------------------------- */
async function loadEmployees() {
  showEmployeesMainView();
  try {
    const employees = await fetchUsers();
    if (!employees || employees.length === 0) {
      console.warn('No se encontraron empleados (tabla vacía o error de permisos).');
      document.getElementById('empleados-list').innerHTML = '<p>No hay empleados para mostrar. Ver consola para detalles.</p>';
      return;
    }
    showEmployeesList(employees);
  } catch (err) {
    console.error('Error al cargar los empleados:', err);
    document.getElementById('empleados-list').innerHTML = '<p>Error al cargar los datos. Mirá la consola.</p>';
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
        <p>Código: ${employee.codigo_empleado} | DNI: ${employee.dni || ''}</p>
        <p>Estado: <span class="status-inside">Activo</span></p>
      </div>
      <div class="employee-level level-${employee.nivel_acceso || 1}">
        ${employee.nivel_acceso === 1 ? 'Empleado' : 'Supervisor'}
      </div>
    `;
    container.appendChild(card);
  });
}

/* -------------------------
   Estadísticas (se mantienen funciones anteriores)
   ------------------------- */
async function loadStatistics() {
  // inicializa interfaz: listeners en botones de etapa
  const buttons = document.querySelectorAll('.stage-btn');
  buttons.forEach(btn => {
    btn.removeEventListener('click', onStageClick);
    btn.addEventListener('click', onStageClick);
  });
  const active = document.querySelector('.stage-btn.active') || buttons[0];
  if (active) renderStage(active.dataset.stage);
}

function onStageClick(e) {
  const btn = e.currentTarget;
  document.querySelectorAll('.stage-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderStage(btn.dataset.stage);
}

async function renderStage(stage) {
  const fallback = document.getElementById('statsFallback');
  const canvas = document.getElementById('statsCanvas');
  if (!canvas) return;
  if (fallback) fallback.style.display = 'none';
  canvas.style.display = 'block';

  if (!supabaseClient) {
    if (fallback) { fallback.textContent = 'No hay conexión a Supabase.'; fallback.style.display = 'block'; }
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('estadisticas')
      .select('fecha,valor,metric')
      .eq('etapa', stage)
      .order('fecha', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      if (statsChartInstance) { statsChartInstance.destroy(); statsChartInstance = null; }
      if (fallback) { fallback.textContent = `No hay datos para ${stage}.`; fallback.style.display = 'block'; }
      return;
    }

    const labels = data.map(r => {
      const d = new Date(r.fecha);
      return isNaN(d.getTime()) ? String(r.fecha) : d.toLocaleDateString();
    });
    const values = data.map(r => Number(r.valor));

    const ctx = document.getElementById('statsCanvas').getContext('2d');
    const config = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: stage,
          data: values,
          fill: true,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true }, tooltip: { mode: 'index', intersect: false } },
        scales: { x: { display: true }, y: { display: true, beginAtZero: true } }
      }
    };

    if (statsChartInstance) {
      statsChartInstance.data = config.data;
      statsChartInstance.options = config.options;
      statsChartInstance.update();
    } else {
      statsChartInstance = new Chart(ctx, config);
    }
  } catch (err) {
    console.error('Error cargando datos de estadisticas', err);
    if (statsChartInstance) { statsChartInstance.destroy(); statsChartInstance = null; }
    if (fallback) { fallback.textContent = `Error cargando datos para ${stage}.`; fallback.style.display = 'block'; }
  }
}

/* -------------------------
   API FUNCTIONS (Supabase) con logging mejorado
   ------------------------- */
async function fetchUsers() {
  if (!supabaseClient) {
    console.error('supabaseClient no inicializado (fetchUsers).');
    return [];
  }
  try {
    const { data, error, status } = await supabaseClient.from('users').select('*');
    if (error) {
      console.error('fetchUsers error:', error, 'status:', status);
      // mostrar info en consola sobre RLS/policies
      console.warn('Si usás Row Level Security (RLS), verificá que la política permita lectura con la anon key.');
      return [];
    }
    console.log('fetchUsers -> registros obtenidos:', Array.isArray(data) ? data.length : 0);
    return data || [];
  } catch (err) {
    console.error('Error al cargar usuarios (fetchUsers):', err);
    return [];
  }
}

async function fetchAccessRecords() {
  if (!supabaseClient) {
    console.error('supabaseClient no inicializado (fetchAccessRecords).');
    return [];
  }
  try {
    const { data, error, status } = await supabaseClient.from('access').select('*');
    if (error) {
      console.error('fetchAccessRecords error:', error, 'status:', status);
      return [];
    }
    console.log('fetchAccessRecords -> registros obtenidos:', Array.isArray(data) ? data.length : 0);
    return data || [];
  } catch (err) {
    console.error('Error al cargar registros de acceso (fetchAccessRecords):', err);
    return [];
  }
}

/* -------------------------
   Registro / captura (se conservan funciones)
   ------------------------- */
function handleCaptureBtn() {
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
}

async function registerUser(userData) {
  if (!supabaseClient) throw new Error('No hay supabaseClient para registrar usuario.');
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
    if (error) {
      console.error('registerUser error:', error);
      throw error;
    }
    return { user: userData };
  } catch (err) {
    console.error('Error al registrar usuario:', err);
    throw err;
  }
}

/* -------------------------
   Upload photo helper
   ------------------------- */
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

async function uploadPhoto(base64Data, filename) {
  if (!supabaseClient) throw new Error('No supabaseClient (uploadPhoto).');
  const blob = dataURLtoBlob(base64Data);
  const { data, error } = await supabaseClient
    .storage
    .from('fotos')
    .upload(`empleados/${filename}.png`, blob, {
      contentType: 'image/png',
      upsert: true
    });
  if (error) { console.error('uploadPhoto error', error); throw error; }
  const { data: publicUrlData } = supabaseClient
    .storage
    .from('fotos')
    .getPublicUrl(`empleados/${filename}.png`);
  return publicUrlData.publicUrl;
}

async function confirmCapture() {
  if (!faceDescriptor) { alert('No hay descriptor facial.'); return; }
  if (faceMatcher) {
    const bestMatch = faceMatcher.findBestMatch(faceDescriptor);
    if (bestMatch.distance < 0.6) {
      const existingUser = userDatabase.find(u => u.codigo_empleado === bestMatch.label);
      const userName = existingUser ? `${existingUser.nombre} ${existingUser.apellido || ''}`.trim() : 'un usuario existente';
      alert(`Este rostro ya está registrado para ${userName} (código: ${bestMatch.label}).`);
      return;
    }
  }
  try {
    currentUser.descriptor = Array.from(faceDescriptor);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const fotoBase64 = canvas.toDataURL('image/png');
    const fotoUrl = await uploadPhoto(fotoBase64, currentUser.codigo_empleado);
    currentUser.foto = fotoUrl;
    const result = await registerUser(currentUser);
    if (result?.user) userDatabase.push(result.user);
    updateFaceMatcher();
    stopVideoStream();
    alert(`Usuario ${currentUser.nombre} ${currentUser.apellido} registrado exitosamente.`);
    clearRegistrationForm();
    showEmployeesMainView();
    loadEmployees();
  } catch (err) {
    console.error('Error al confirmar captura:', err);
    alert('Error al registrar usuario. Mirá la consola para más info.');
  }
}

/* -------------------------
   Utils: camera, matcher, screens
   ------------------------- */
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await new Promise(resolve => {
      video.onloadedmetadata = () => { video.play(); resolve(); };
    });

    const displaySize = { width: video.clientWidth || video.offsetWidth, height: video.clientHeight || video.offsetHeight };
    overlay.width = displaySize.width; overlay.height = displaySize.height;
    overlay.style.width = `${displaySize.width}px`; overlay.style.height = `${displaySize.height}px`;
    captureStatus.textContent = 'Cámara lista. Esperando detección facial...';
    captureStatus.className = 'status info';
    detectFaceForRegistration();
  } catch (err) {
    console.error('Error initCamera:', err);
    captureStatus.textContent = 'Error: No se pudo acceder a la cámara.';
    captureStatus.className = 'status error';
  }
}

function detectFaceForRegistration() {
  if (detectionInterval) clearInterval(detectionInterval);
  detectionInterval = setInterval(async () => {
    if (!video || !video.clientWidth) return;
    try {
      if (typeof faceapi === 'undefined') return;
      const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks().withFaceDescriptors();

      const displaySize = { width: video.clientWidth || video.offsetWidth, height: video.clientHeight || video.offsetHeight };
      if (overlay.width !== displaySize.width || overlay.height !== displaySize.height) {
        overlay.width = displaySize.width; overlay.height = displaySize.height;
        overlay.style.width = `${displaySize.width}px`; overlay.style.height = `${displaySize.height}px`;
      }
      const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height);

      if (detections.length > 0) {
        const resized = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(overlay, resized);
        faceapi.draw.drawFaceLandmarks(overlay, resized);
      }

      if (detections.length === 1) {
        captureStatus.textContent = 'Rostro detectado. Confirme la captura.'; captureStatus.className = 'status success';
        document.getElementById('confirm-capture-btn').disabled = false;
        faceDescriptor = detections[0].descriptor;
      } else {
        document.getElementById('confirm-capture-btn').disabled = true; faceDescriptor = null;
        if (detections.length > 1) { captureStatus.textContent = 'Se detectó más de un rostro.'; captureStatus.className = 'status error'; }
        else { captureStatus.textContent = 'No se detectó rostro.'; captureStatus.className = 'status info'; }
      }
    } catch (err) {
      console.error('Error en detectFaceForRegistration:', err);
    }
  }, 200);
}

function updateFaceMatcher() {
  if (!userDatabase || userDatabase.length === 0) { faceMatcher = null; return; }
  const labeled = userDatabase.map(u => {
    if (u.descriptor && u.descriptor.length) {
      return new faceapi.LabeledFaceDescriptors(u.codigo_empleado, [new Float32Array(u.descriptor)]);
    }
    return null;
  }).filter(Boolean);
  faceMatcher = labeled.length ? new faceapi.FaceMatcher(labeled, 0.6) : null;
}

function stopVideoStream() {
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null;
  }
  if (overlay && overlay.getContext) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
}

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

/* -------------------------
   Logout
   ------------------------- */
function logout() {
  sessionStorage.removeItem('isSupervisor');
  window.location.href = 'index.html';
}
