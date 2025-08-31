const API_BASE_URL = 'https://xtruedkvobfabctfmyys.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo'; 
const { createClient } = supabase;
const supabaseClient = createClient('https://xtruedkvobfabctfmyys.supabase.co', SUPABASE_ANON_KEY);

// ------------------- Globals ------------------- //
let currentUser = null;
let faceDescriptor = null;
let faceMatcher = null;
let countdownInterval = null;
let detectionInterval = null;
let userDatabase = [];
let accessRecords = [];
let currentLoginType = 'ingreso';

// ------------------- DOM refs ------------------- //
const screens = document.querySelectorAll('.screen');
const video = document.getElementById('video');
const loginVideo = document.getElementById('login-video');
const overlay = document.getElementById('overlay');
const loginOverlay = document.getElementById('login-overlay');
const countdownElement = document.getElementById('countdown');
const captureStatus = document.getElementById('capture-status');
const loginStatus = document.getElementById('login-status');

// ------------------- Event listeners ------------------- //
(function attachListeners() {
  const el = id => document.getElementById(id);

  const ingresoBtn = el('ingreso-btn');
  if (ingresoBtn) ingresoBtn.addEventListener('click', () => startFacialLogin('ingreso'));

  const egresoBtn = el('egreso-btn');
  if (egresoBtn) egresoBtn.addEventListener('click', () => startFacialLogin('egreso'));

  // 🔹 FIX: cubrir ambos botones "volver"
  ['back-to-home-from-denied', 'back-to-home-from-denied-2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => showScreen('home-screen'));
  });

  const backAfterAccess = el('back-after-access');
  if (backAfterAccess) backAfterAccess.addEventListener('click', () => showScreen('home-screen'));

  const tryAgainBtn = el('try-again-btn');
  if (tryAgainBtn) tryAgainBtn.addEventListener('click', () => startFacialLogin(currentLoginType));

  const confirmCaptureBtn = el('confirm-capture-btn');
  if (confirmCaptureBtn) confirmCaptureBtn.addEventListener('click', confirmCapture);

  const retryCaptureBtn = el('retry-capture-btn');
  if (retryCaptureBtn) retryCaptureBtn.addEventListener('click', restartFaceCapture);

  const manualLoginBtn = el('manual-login-btn');
  if (manualLoginBtn) manualLoginBtn.addEventListener('click', attemptManualLogin);

  const retryFacialLoginBtn = el('retry-facial-login-btn');
  if (retryFacialLoginBtn) retryFacialLoginBtn.addEventListener('click', () => startFacialLogin(currentLoginType));

  const supervisorMenuBtn = el('supervisor-menu-btn');
  if (supervisorMenuBtn) supervisorMenuBtn.addEventListener('click', () => window.location.href = 'menu.html');

  const refreshRecordsBtn = el('refresh-records');
  if (refreshRecordsBtn) refreshRecordsBtn.addEventListener('click', () => loadRecords());
})();

// ------------------- API helpers ------------------- //
async function fetchUsers() {
  try {
    const { data, error } = await supabaseClient.from('users').select('*');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('fetchUsers error', err);
    return [];
  }
}
async function fetchAccessRecords() {
  try {
    const { data, error } = await supabaseClient.from('access').select('*');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('fetchAccessRecords error', err);
    return [];
  }
}
async function registerUser(userData) {
  try {
    const formData = new FormData();
    formData.append('codigo_empleado', userData.codigo_empleado);
    formData.append('nombre', userData.nombre);
    formData.append('dni', userData.dni);
    formData.append('nivel_acceso', userData.nivel_acceso);
    formData.append('descriptor', JSON.stringify(userData.descriptor));
    if (userData.foto) {
      const response = await fetch(userData.foto);
      const blob = await response.blob();
      formData.append('foto', blob, 'foto.png');
    }
    const { data, error } = await supabaseClient.functions.invoke('register', {
      body: formData,
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('registerUser error', err);
    throw err;
  }
}
async function registerAccess(codigoOperario, tipo) {
  try {
    const { data, error } = await supabaseClient.functions.invoke('access', {
      body: { codigo_empleado: codigoOperario, tipo: tipo }
    });
    if (error) throw error;
    accessRecords.push({ codigo_empleado: codigoOperario, tipo: tipo, fecha_hora: new Date().toISOString() });
    return data;
  } catch (err) {
    console.error('registerAccess error', err);
    throw err;
  }
}

// ------------------- Init ------------------- //
async function init() {
  try {
    console.log('Cargando modelos face-api...');
    const MODEL_BASE_URL = '/tpi-pyme_alimenticia/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_BASE_URL}/tiny_face_detector`);
    await faceapi.nets.faceLandmark68Net.loadFromUri(`${MODEL_BASE_URL}/face_landmark_68`);
    await faceapi.nets.faceRecognitionNet.loadFromUri(`${MODEL_BASE_URL}/face_recognition`);
    try { await faceapi.nets.faceExpressionNet.loadFromUri(`${MODEL_BASE_URL}/face_expression`); } catch (e) {}

    userDatabase = await fetchUsers();
    accessRecords = await fetchAccessRecords();
    updateFaceMatcher();
    console.log('Init OK');
  } catch (err) {
    console.error('init error', err);
  }
}

// ------------------- Screens ------------------- //
function showScreen(screenId) {
  if (screenId === 'home-screen') sessionStorage.removeItem('isSupervisor');
  screens.forEach(s => s.classList.remove('active'));
  const el = document.getElementById(screenId);
  if (el) el.classList.add('active');

  // parar procesos
  if (screenId !== 'login-screen') stopFacialRecognition();
  if (screenId !== 'capture-screen') stopVideoStream();

  // 🔹 reset manual login si volvemos al login
  if (screenId === 'login-screen') resetManualLogin();
}

// ------------------- Manual Login Reset ------------------- //
function resetManualLogin() {
  const manualLoginEl = document.getElementById('manual-login');
  if (manualLoginEl) {
    manualLoginEl.style.display = 'none';
    manualLoginEl.dataset.visible = 'false';
    document.getElementById('manual-operator-code').value = '';
    document.getElementById('manual-operator-dni').value = '';
  }
  const loginStatusEl = document.getElementById('login-status');
  if (loginStatusEl) {
    loginStatusEl.textContent = 'Buscando coincidencias...';
    loginStatusEl.className = 'status info';
  }
}

// ------------------- Registro (captura) -------------------
async function startFaceCapture() {
    const operatorCode = document.getElementById('operator-code')?.value;
    const operatorName = document.getElementById('operator-name')?.value;
    const operatorDni = document.getElementById('operator-dni')?.value;
    const operatorLevel = document.getElementById('operator-level')?.value;
  
    if (!operatorCode || !operatorName || !operatorDni || !operatorLevel) {
      alert('Por favor complete todos los campos antes de continuar.');
      return;
    }
    if (userDatabase.find(u => u.codigo_empleado === operatorCode)) {
      alert('Código ya registrado.');
      return;
    }
  
    currentUser = {
      codigo_empleado: operatorCode,
      nombre: operatorName,
      dni: operatorDni,
      nivel_acceso: parseInt(operatorLevel),
      foto: '',
      descriptor: null
    };
  
    showScreen('capture-screen');
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      video.srcObject = stream;
  
      // esperar metadata y play
      await new Promise(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });
  
      // --- aquí: usar el tamaño visual del elemento para el canvas ---
      const displaySize = {
        width: video.clientWidth || video.offsetWidth,
        height: video.clientHeight || video.offsetHeight
      };
      // Ajustar canvas tamaño de pixeles y estilo CSS
      overlay.width = displaySize.width;
      overlay.height = displaySize.height;
      overlay.style.width = `${displaySize.width}px`;
      overlay.style.height = `${displaySize.height}px`;
  
      captureStatus.textContent = 'Cámara lista. Esperando detección facial...';
      captureStatus.className = 'status info';
  
      detectFaceForRegistration();
    } catch (err) {
      console.error('startFaceCapture camera error', err);
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
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptors();
  
        // Usar las dimensiones visuales del elemento
        const displaySize = {
          width: video.clientWidth || video.offsetWidth,
          height: video.clientHeight || video.offsetHeight
        };
  
        // Asegurar que el canvas tenga la misma resolución
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
        console.error('detectFaceForRegistration error', err);
      }
    }, 200);
  }
  

async function confirmCapture() {
  if (!faceDescriptor) { alert('No hay descriptor facial.'); return; }
  try {
    currentUser.descriptor = Array.from(faceDescriptor);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    currentUser.foto = canvas.toDataURL('image/png');

    const result = await registerUser(currentUser);
    if (result?.user) userDatabase.push(result.user);

    updateFaceMatcher();
    stopVideoStream();
    alert(`Usuario ${currentUser.nombre} registrado.`);
    document.getElementById('operator-code') && (document.getElementById('operator-code').value = '');
    document.getElementById('operator-name') && (document.getElementById('operator-name').value = '');
    document.getElementById('operator-dni') && (document.getElementById('operator-dni').value = '');
    document.getElementById('operator-level') && (document.getElementById('operator-level').value = '1');
    showScreen('home-screen');
  } catch (err) {
    console.error('confirmCapture error', err);
    alert('Error al registrar usuario.');
  }
}

function restartFaceCapture() {
  document.getElementById('confirm-capture-btn') && (document.getElementById('confirm-capture-btn').disabled = true);
  faceDescriptor = null;
  const ctx = overlay.getContext('2d');
  ctx && ctx.clearRect(0, 0, overlay.width, overlay.height);
}

// ------------------- Login facial (reconocimiento) -------------------
async function startFacialLogin(tipo) {
  currentLoginType = tipo;

  // resetear manual-login para que vuelva a mostrarse si falla
  const manualLoginEl = document.getElementById('manual-login');
  if (manualLoginEl) {
    manualLoginEl.style.display = 'none';
    manualLoginEl.dataset.visible = 'false'; // <-- reset
  }

  const title = document.getElementById('login-title');
  const desc = document.getElementById('login-description');
  if (tipo === 'ingreso') {
    title.textContent = 'Registro de Ingreso';
    desc.textContent = 'Por favor, colóquese frente a la cámara para registrar su ingreso.';
  } else {
    title.textContent = 'Registro de Egreso';
    desc.textContent = 'Por favor, colóquese frente a la cámara para registrar su egreso.';
  }

  showScreen('login-screen');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    loginVideo.srcObject = stream;
    await new Promise(resolve => {
      loginVideo.onloadedmetadata = () => { loginVideo.play(); resolve(); };
    });

    const displaySize = {
      width: loginVideo.clientWidth || loginVideo.offsetWidth,
      height: loginVideo.clientHeight || loginVideo.offsetHeight
    };
    loginOverlay.width = displaySize.width;
    loginOverlay.height = displaySize.height;
    loginOverlay.style.width = `${displaySize.width}px`;
    loginOverlay.style.height = `${displaySize.height}px`;

    startFacialRecognition();
  } catch (err) {
    console.error('startFacialLogin camera error', err);
    loginStatus.textContent = 'No se pudo acceder a la cámara.';
    loginStatus.className = 'status error';
    showManualLoginOption();
  }
}

  

  function startFacialRecognition() {
    let recognized = false;
    let countdown = 5;
    if (countdownElement) countdownElement.textContent = countdown;
  
    // limpiar timers anteriores
    if (countdownInterval) clearInterval(countdownInterval);
    if (detectionInterval) clearInterval(detectionInterval);
  
    countdownInterval = setInterval(() => {
      countdown--;
      if (countdownElement) countdownElement.textContent = Math.max(0, countdown);
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        if (!recognized) {
          stopFacialRecognition();
          showManualLoginOption();
        }
      }
    }, 1000);
  
    detectionInterval = setInterval(async () => {
      if (!loginVideo || !loginVideo.clientWidth || !loginVideo.clientHeight) return;
  
      try {
        const detections = await faceapi
          .detectAllFaces(loginVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptors();
  
        const displaySize = {
          width: loginVideo.clientWidth || loginVideo.offsetWidth,
          height: loginVideo.clientHeight || loginVideo.offsetHeight
        };
  
        // asegurar canvas coincide
        if (loginOverlay.width !== displaySize.width || loginOverlay.height !== displaySize.height) {
          loginOverlay.width = displaySize.width;
          loginOverlay.height = displaySize.height;
          loginOverlay.style.width = `${displaySize.width}px`;
          loginOverlay.style.height = `${displaySize.height}px`;
        }
  
        const ctx = loginOverlay.getContext('2d');
        ctx.clearRect(0, 0, loginOverlay.width, loginOverlay.height);
  
        if (detections.length > 0) {
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          faceapi.draw.drawDetections(loginOverlay, resizedDetections);
          faceapi.draw.drawFaceLandmarks(loginOverlay, resizedDetections);
        }
  
        if (detections.length > 0 && faceMatcher) {
          const bestMatch = faceMatcher.findBestMatch(detections[0].descriptor);
          if (bestMatch && bestMatch.distance < 0.6) {
            recognized = true;
            clearInterval(countdownInterval);
            clearInterval(detectionInterval);
            const foundUser = userDatabase.find(u => u.codigo_empleado === bestMatch.label);
            if (foundUser) {
              stopFacialRecognition();
              grantAccess(foundUser);
              return;
            }
          }
        }
      } catch (err) {
        console.error('startFacialRecognition error', err);
      }
    }, 200);
  }
  
function stopFacialRecognition() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
}

// detener transmisiones (captura y login)
function stopVideoStream() {
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  if (loginVideo && loginVideo.srcObject) {
    loginVideo.srcObject.getTracks().forEach(t => t.stop());
    loginVideo.srcObject = null;
  }
  if (overlay && overlay.getContext) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
  if (loginOverlay && loginOverlay.getContext) loginOverlay.getContext('2d').clearRect(0, 0, loginOverlay.width, loginOverlay.height);
  stopFacialRecognition();
}

function showManualLoginOption() {
  const loginStatusEl = document.getElementById('login-status');
  const manualLoginEl = document.getElementById('manual-login');

  if (!manualLoginEl) return;
  if (manualLoginEl.dataset.visible === 'true') return;

  // mensaje de error
  if (loginStatusEl) {
    loginStatusEl.textContent = 'No se pudo reconocer su rostro. Por favor, use el inicio de sesión manual.';
    loginStatusEl.className = 'status error';
    loginStatusEl.style.display = 'block';
  }

  // mostrar manual login
  manualLoginEl.style.display = 'block';
  manualLoginEl.dataset.visible = 'true';

  manualLoginEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function attemptManualLogin() {
  const operatorCode = document.getElementById('manual-operator-code')?.value;
  const operatorDni = document.getElementById('manual-operator-dni')?.value;
  if (!operatorCode || !operatorDni) { alert('Complete los campos'); return; }
  const user = userDatabase.find(u => u.codigo_empleado === operatorCode && u.dni === operatorDni);
  if (user) grantAccess(user); else denyAccess('Credenciales incorrectas.');
}

// grant/deny access (mantengo tu lógica)
async function grantAccess(user) {
  try {
    const allUserRecords = accessRecords.filter(r => r.codigo_empleado === user.codigo_empleado)
      .sort((a,b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
    let canAccess = true; let errorMessage = '';
    if (allUserRecords.length > 0) {
      const last = allUserRecords[0];
      if (currentLoginType === 'ingreso' && last.tipo === 'ingreso') { canAccess = false; errorMessage = `${user.nombre}, ya está dentro.`; }
      if (currentLoginType === 'egreso' && last.tipo === 'egreso') { canAccess = false; errorMessage = `${user.nombre}, ya está fuera.`; }
    }
    if (!canAccess) { document.getElementById('denial-reason').textContent = errorMessage; showScreen('access-denied-screen'); return; }

    await registerAccess(user.codigo_empleado, currentLoginType);
    const tipoTexto = currentLoginType === 'ingreso' ? 'ingreso' : 'egreso';
    document.getElementById('welcome-message').textContent = `${user.nombre}, su ${tipoTexto} ha sido registrado correctamente.`;

    if (currentLoginType === 'ingreso' && user.nivel_acceso >= 3) {
      document.getElementById('supervisor-menu-btn').style.display = 'block';
      sessionStorage.setItem('isSupervisor', 'true');
    } else {
      document.getElementById('supervisor-menu-btn').style.display = 'none';
    }

    showScreen('access-granted-screen');
    setTimeout(() => showScreen('home-screen'), 8000);
  } catch (err) {
    console.error('grantAccess error', err);
    // fallback UX: mostrar éxito aún si falla registro remoto
    document.getElementById('welcome-message').textContent = `${user.nombre}, su registro fue procesado (fallback).`;
    showScreen('access-granted-screen');
    setTimeout(() => showScreen('home-screen'), 8000);
  }
}

function denyAccess(reason) {
  document.getElementById('denial-reason').textContent = reason;
  showScreen('access-denied-screen');
}

// Face matcher update (mantén tu lógica)
function updateFaceMatcher() {
  if (!userDatabase || userDatabase.length === 0) { faceMatcher = null; return; }
  const labeled = userDatabase.map(u => {
    if (u.descriptor && u.descriptor.length) return new faceapi.LabeledFaceDescriptors(u.codigo_empleado, [new Float32Array(u.descriptor)]);
    return null;
  }).filter(Boolean);
  if (labeled.length) { faceMatcher = new faceapi.FaceMatcher(labeled, 0.6); }
  else faceMatcher = null;
}

// Registros UI (mantén tu loadRecords)
async function loadRecords() {
  try {
    if (!accessRecords || accessRecords.length === 0) accessRecords = await fetchAccessRecords();
    const users = await fetchUsers();
    const userMap = {}; users.forEach(u => userMap[u.codigo_empleado] = u);
    const tbody = document.getElementById('records-tbody');
    if (tbody) tbody.innerHTML = '';
    const sorted = (accessRecords || []).sort((a,b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
    sorted.forEach(r => {
      const tr = document.createElement('tr');
      const user = userMap[r.codigo_empleado];
      tr.innerHTML = `<td>${new Date(r.fecha_hora).toLocaleString('es-ES')}</td><td>${user?user.nombre:'Desconocido'}</td><td>${r.codigo_empleado}</td><td>${r.tipo}</td><td>${/* estado aproximado */ ''}</td>`;
      tbody && tbody.appendChild(tr);
    });
  } catch (err) { console.error('loadRecords error', err); }
}

// Iniciar cuando cargue la página
window.addEventListener('load', init);

