const API_BASE_URL = 'https://xtruedkvobfabctfmyys.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo'; 
const { createClient } = supabase;
const supabaseClient = createClient('https://xtruedkvobfabctfmyys.supabase.co', SUPABASE_ANON_KEY);

// ------------------- Globals ------------------- //
let processingAccess = false;
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

// Reemplaza la función registerAccess existente con esta versión mejorada
async function registerAccess(codigoOperario, tipo) {
  try {
    // Solo hacer la llamada al servidor, NO actualizar el array local aquí
    const { data, error } = await supabaseClient.functions.invoke('access', {
      body: { codigo_empleado: codigoOperario, tipo: tipo }
    });
    if (error) throw error;
    
    // Retornar solo el resultado del servidor
    return data;
  } catch (err) {
    console.error('registerAccess error', err);
    throw err;
  }
}

async function registerAccessSafe(codigoOperario, tipo) {
  try {
    // 1) Obtener último registro REAL del servidor para este empleado
    const { data: lastAccess, error: lastErr } = await supabaseClient
      .from('access')
      .select('*')
      .eq('codigo_empleado', codigoOperario)
      .order('fecha_hora', { ascending: false })
      .limit(1);

    if (lastErr) {
      console.error('registerAccessSafe - error obteniendo último access:', lastErr);
      throw lastErr;
    }

    // 2) Si el último registro existe y es del mismo tipo, no insertar (idempotencia)
    if (lastAccess && lastAccess.length && lastAccess[0].tipo === tipo) {
      return { skipped: true, message: 'Último registro es igual, se evitó duplicado.' };
    }

    // 3) Insertar nuevo registro
    const { data, error: insertErr } = await supabaseClient
      .from('access')
      .insert({
        codigo_empleado: codigoOperario,
        tipo,
        fecha_hora: new Date().toISOString()
      });

    if (insertErr) {
      console.error('registerAccessSafe - insert error:', insertErr);
      throw insertErr;
    }

    return { skipped: false, data };
  } catch (err) {
    console.error('registerAccessSafe error', err);
    throw err;
  }
}
// Modifica la función grantAccess para evitar duplicados
async function grantAccess(user) {
  if (processingAccess) {
    console.warn('grantAccess: ya se está procesando otro acceso, ignorando.');
    return;
  }
  processingAccess = true;

  try {
    // Obtener último registro en servidor (garantizar frescura)
    const { data: lastAccess, error: lastErr } = await supabaseClient
      .from('access')
      .select('*')
      .eq('codigo_empleado', user.codigo_empleado)
      .order('fecha_hora', { ascending: false })
      .limit(1);

    if (lastErr) {
      console.error('Error obteniendo último acceso:', lastErr);
      // fallback: permitimos seguir, pero lo registramos igual
    }

    const last = (lastAccess && lastAccess.length) ? lastAccess[0] : null;

    // Reglas de negocio (no permitir doble ingreso/egreso consecutivo)
    if (last) {
      if (currentLoginType === 'ingreso' && last.tipo === 'ingreso') {
        document.getElementById('denial-reason').textContent = `${user.nombre}, ya está dentro.`;
        showScreen('access-denied-screen');
        return;
      }
      if (currentLoginType === 'egreso' && last.tipo === 'egreso') {
        document.getElementById('denial-reason').textContent = `${user.nombre}, ya está fuera.`;
        showScreen('access-denied-screen');
        return;
      }
    }

    // Intentar registrar de forma segura (evita duplicados si otro cliente ya insertó)
    const res = await registerAccessSafe(user.codigo_empleado, currentLoginType);

    if (res.skipped) {
      console.info('grantAccess: registro saltado (ya existe uno igual en servidor).');
      document.getElementById('denial-reason').textContent = `${user.nombre}, su acción ya fue registrada.`;
      showScreen('access-denied-screen');
      return;
    }

    // Refrescar registros locales una sola vez
    accessRecords = await fetchAccessRecords();

    // UI de éxito
    const tipoTexto = currentLoginType === 'ingreso' ? 'ingreso' : 'egreso';
    document.getElementById('welcome-message').textContent = `${user.nombre}, su ${tipoTexto} ha sido registrado correctamente.`;

    if (currentLoginType === 'ingreso' && user.nivel_acceso >= 3) {
      const supBtn = document.getElementById('supervisor-menu-btn');
      if (supBtn) supBtn.style.display = 'block';
      sessionStorage.setItem('isSupervisor', 'true');
    } else {
      const supBtn = document.getElementById('supervisor-menu-btn');
      if (supBtn) supBtn.style.display = 'none';
    }

    showScreen('access-granted-screen');
  } catch (err) {
    console.error('grantAccess error:', err);
    document.getElementById('welcome-message').textContent = `${user.nombre}, su registro fue procesado (fallback).`;
    showScreen('access-granted-screen');
  } finally {
    // pequeño retardo para evitar ráfagas (y liberar lock)
    setTimeout(() => { processingAccess = false; }, 800);
  }
}


// Función adicional para debug - puedes llamarla desde la consola
function debugAccessRecords(codigoEmpleado) {
  const records = accessRecords.filter(r => r.codigo_empleado === codigoEmpleado);
  console.log(`Registros para ${codigoEmpleado}:`, records);
  
  // Verificar duplicados
  const duplicates = records.filter((record, index, arr) => {
    return arr.findIndex(r => 
      r.fecha_hora === record.fecha_hora && 
      r.tipo === record.tipo
    ) !== index;
  });
  
  if (duplicates.length > 0) {
    console.warn('Duplicados encontrados:', duplicates);
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

function renderRecords() {
  try {
    const userMap = {};
    userDatabase.forEach(u => userMap[u.codigo_empleado] = u);

    // Deduplicar registros por clave única (codigo+fecha+tipo)
    const seen = new Set();
    const deduped = (accessRecords || []).slice().sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)).filter(r => {
      const key = `${r.codigo_empleado}::${r.fecha_hora}::${r.tipo}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Mapear estado actual por usuario (último tipo)
    const userStatusMap = {};
    userDatabase.forEach(user => {
      const records = deduped.filter(r => r.codigo_empleado === user.codigo_empleado).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
      userStatusMap[user.codigo_empleado] = records.length ? records[0].tipo : 'egreso';
    });

    const peopleInside = Object.values(userStatusMap).filter(t => t === 'ingreso').length;
    const peopleOutside = Math.max(0, userDatabase.length - peopleInside);

    document.getElementById('people-inside-count').textContent = peopleInside;
    document.getElementById('people-outside-count').textContent = peopleOutside;

    const tbody = document.getElementById('records-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    deduped.forEach(record => {
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

      if (detections.length > 0 && faceMatcher && !processingAccess) {
        const bestMatch = faceMatcher.findBestMatch(detections[0].descriptor);
        if (bestMatch && bestMatch.distance < 0.6) {
          recognized = true;
          // Detener inmediatamente para evitar reentradas
          clearInterval(countdownInterval);
          clearInterval(detectionInterval);
          stopFacialRecognition();

          // establecer lock para que no venga otra llamada mientras procesamos
          processingAccess = true;
          const foundUser = userDatabase.find(u => u.codigo_empleado === bestMatch.label);
          if (foundUser) {
            await grantAccess(foundUser);
          }
          // grantAccess liberará processingAccess (en su finally) después del timeout
          return;
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

/* ---------- showManualLoginOption (actualizada) ---------- */
function showManualLoginOption() {
  const loginStatusEl = document.getElementById('login-status');
  const manualLoginEl = document.getElementById('manual-login');

  if (!manualLoginEl) return;
  if (manualLoginEl.dataset.visible === 'true') return;

  // Ajustar títulos y texto del botón según tipo (ingreso/egreso)
  const manualTitleEl = manualLoginEl.querySelector('h3');
  const manualBtn = document.getElementById('manual-login-btn');
  const retryFacialBtn = document.getElementById('retry-facial-login-btn');

  if (currentLoginType === 'egreso') {
    if (manualTitleEl) manualTitleEl.textContent = 'Cierre de Sesión Manual';
    if (manualBtn) manualBtn.textContent = 'Acreditar egreso manual';
    if (loginStatusEl) loginStatusEl.textContent = 'No se pudo acreditar el egreso por reconocimiento. Por favor use el cierre de sesión manual.';
  } else { // 'ingreso' por defecto
    if (manualTitleEl) manualTitleEl.textContent = 'Inicio de Sesión Manual';
    if (manualBtn) manualBtn.textContent = 'Acreditar ingreso manual';
    if (loginStatusEl) loginStatusEl.textContent = 'No se pudo acreditar el ingreso por reconocimiento. Por favor use el inicio de sesión manual.';
  }

  // cambiar texto del botón de reintento para mayor claridad
  if (retryFacialBtn) retryFacialBtn.textContent = 'Reintentar reconocimiento';

  // clases / estilo de status
  if (loginStatusEl) {
    loginStatusEl.className = 'status error';
    loginStatusEl.style.display = 'block';
  }

  // mostrar manual login
  manualLoginEl.style.display = 'block';
  manualLoginEl.dataset.visible = 'true';

  // enfocar el primer input para acelerar el flujo
  const firstInput = manualLoginEl.querySelector('input');
  if (firstInput) firstInput.focus();

  manualLoginEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}



async function attemptManualLogin() {
  const operatorCode = document.getElementById('manual-operator-code')?.value;
  const operatorDni = document.getElementById('manual-operator-dni')?.value;
  if (!operatorCode || !operatorDni) { alert('Complete los campos'); return; }
  const user = userDatabase.find(u => u.codigo_empleado === operatorCode && u.dni === operatorDni);
  if (user) grantAccess(user); else denyAccess('Credenciales incorrectas.');
}


function denyAccess(reason) {
  document.getElementById('denial-reason').textContent = reason;
  showScreen('access-denied-screen');
}

// Face matcher update
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
