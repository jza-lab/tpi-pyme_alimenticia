// Configuración de la API
const API_BASE_URL = 'https://xtruedkvobfabctfmyys.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo';
const { createClient } = supabase;
const supabaseClient = createClient('https://xtruedkvobfabctfmyys.supabase.co', SUPABASE_ANON_KEY);

// Variables globales
let currentUser = null;
let faceDescriptor = null;
let faceMatcher = null;
let countdownInterval = null;
let detectionInterval = null;
let userDatabase = []; // Se cargará desde el backend
let accessRecords = []; // Se cargará desde el backend
let currentLoginType = 'ingreso'; // Tipo de login actual (ingreso/egreso)

// Elementos del DOM
const screens = document.querySelectorAll('.screen');
const video = document.getElementById('video');
const loginVideo = document.getElementById('login-video');
const overlay = document.getElementById('overlay');
const loginOverlay = document.getElementById('login-overlay');
const countdownElement = document.getElementById('countdown');
const captureStatus = document.getElementById('capture-status');
const loginStatus = document.getElementById('login-status');

// Botones y sus event listeners
document.getElementById('register-btn').addEventListener('click', () => showScreen('register-screen'));
document.getElementById('ingreso-btn').addEventListener('click', () => startFacialLogin('ingreso'));
document.getElementById('egreso-btn').addEventListener('click', () => startFacialLogin('egreso'));
document.getElementById('view-records-btn').addEventListener('click', () => showRecordsScreen());
document.getElementById('back-to-home-from-register').addEventListener('click', () => showScreen('home-screen'));
document.getElementById('back-to-home-from-denied').addEventListener('click', () => showScreen('home-screen'));
document.getElementById('back-after-access').addEventListener('click', () => showScreen('home-screen'));
document.getElementById('back-to-home-from-records').addEventListener('click', () => showScreen('home-screen'));
document.getElementById('refresh-records').addEventListener('click', () => loadRecords());
document.getElementById('try-again-btn').addEventListener('click', () => startFacialLogin(currentLoginType));
document.getElementById('capture-btn').addEventListener('click', startFaceCapture);
document.getElementById('confirm-capture-btn').addEventListener('click', confirmCapture);
document.getElementById('retry-capture-btn').addEventListener('click', restartFaceCapture);
document.getElementById('manual-login-btn').addEventListener('click', attemptManualLogin);
document.getElementById('retry-facial-login-btn').addEventListener('click', () => startFacialLogin(currentLoginType));
document.getElementById('clear-records-btn').addEventListener('click', clearRecords);
document.getElementById('reset-users-btn').addEventListener('click', resetUsers);
document.getElementById('go-to-menu-btn').addEventListener('click', () => window.location.href = 'menu.html');

// Funciones de API
async function fetchUsers() {
    try {
        const { data, error } = await supabaseClient.from('users').select('*');
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        return [];
    }
}

async function fetchAccessRecords() {
    try {
        const { data, error } = await supabaseClient.from('access').select('*');
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al cargar registros de acceso:', error);
        return [];
    }
}

async function clearAccessRecords() {
    try {
        const { data, error } = await supabaseClient.functions.invoke('access', { method: 'DELETE' });
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al limpiar registros de acceso:', error);
        throw error;
    }
}

async function clearUsers() {
    try {
        const { data, error } = await supabaseClient.functions.invoke('users', { method: 'DELETE' });
        if (error) throw new Error(error.message);
        return data;
    } catch (error) {
        console.error('Error al limpiar registros:', error);
        throw error;
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
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        if (error) throw new Error(error.message || 'Error al registrar usuario');
        return data;
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        throw error;
    }
}

async function registerAccess(codigoOperario, tipo) {
    try {
        const { data, error } = await supabaseClient.functions.invoke('access', {
            body: {
                codigo_empleado: codigoOperario,
                tipo: tipo
            }
        });
        if (error) throw new Error(error.message || 'Error al registrar acceso');

        accessRecords.push({
            codigo_empleado: codigoOperario,
            tipo: tipo,
            fecha_hora: new Date().toISOString()
        });

        return data;
    } catch (error) {
        console.error('Error al registrar acceso:', error);
        throw error;
    }
}

// Inicializar la aplicación
async function init() {
    try {
        // Cargar modelos de face-api.js desde el frontend
        const MODEL_BASE_URL = '/tpi-pyme_alimenticia/models';

        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(`${MODEL_BASE_URL}/tiny_face_detector`),
            faceapi.nets.faceLandmark68Net.loadFromUri(`${MODEL_BASE_URL}/face_landmark_68`),
            faceapi.nets.faceRecognitionNet.loadFromUri(`${MODEL_BASE_URL}/face_recognition`),
            faceapi.nets.faceExpressionNet.loadFromUri(`${MODEL_BASE_URL}/face_expression`)
        ]);

        console.log('Modelos de reconocimiento facial cargados correctamente');

        // Cargar usuarios desde el backend
        userDatabase = await fetchUsers();

        // Cargar registros de acceso desde el backend
        accessRecords = await fetchAccessRecords();

        // Actualizar faceMatcher con los usuarios existentes
        updateFaceMatcher();
    } catch (error) {
        console.error('Error al inicializar la aplicación:', error);
        alert('Error al inicializar la aplicación.');
    }
}

// Mostrar una pantalla específica y ocultar las demás
function showScreen(screenId) {
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');

    // Detener cualquier proceso en curso al cambiar de pantalla
    if (screenId !== 'login-screen') {
        stopFacialRecognition();
    }
    if (screenId !== 'capture-screen') {
        stopVideoStream();
    }
}

// Iniciar la captura facial para registro
async function startFaceCapture() {
    const operatorCode = document.getElementById('operator-code').value;
    const operatorName = document.getElementById('operator-name').value;
    const operatorDni = document.getElementById('operator-dni').value;
    const operatorLevel = document.getElementById('operator-level').value;

    // Validar campos
    if (!operatorCode || !operatorName || !operatorDni || !operatorLevel) {
        alert('Por favor, complete todos los campos antes de continuar.');
        return;
    }

    // Verificar si el código de operario ya existe
    if (userDatabase.find(user => user.codigo_empleado === operatorCode)) {
        alert('Este código de operario ya está registrado. Por favor, use otro.');
        return;
    }

    // Guardar datos del usuario temporalmente
    currentUser = {
        codigo_empleado: operatorCode,
        nombre: operatorName,
        dni: operatorDni,
        nivel_acceso: parseInt(operatorLevel),
        foto: '',
        descriptor: null
    };

    // Mostrar pantalla de captura
    showScreen('capture-screen');

    // Iniciar la cámara
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 600, height: 450 }
        });
        video.srcObject = stream;

        // Esperar a que el video esté listo
        video.onloadedmetadata = () => {
            // Configurar canvas overlay
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;

            // Iniciar detección facial
            detectFaceForRegistration();
        };
    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        captureStatus.textContent = 'Error: No se pudo acceder a la cámara. Asegúrese de permitir el acceso.';
        captureStatus.className = 'status error';
    }
}

// Detectar rostros para registro
function detectFaceForRegistration() {
    const displaySize = { width: video.videoWidth, height: video.videoHeight };

    // Limpiar cualquier intervalo previo
    if (detectionInterval) clearInterval(detectionInterval);

    detectionInterval = setInterval(async () => {
        const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Dibujar detecciones
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(overlay, resizedDetections);
        faceapi.draw.drawFaceLandmarks(overlay, resizedDetections);

        // Verificar si se detectó exactamente un rostro
        if (detections.length === 1) {
            captureStatus.textContent = 'Rostro detectado correctamente. Por favor, confirme la captura.';
            captureStatus.className = 'status success';
            document.getElementById('confirm-capture-btn').disabled = false;
            faceDescriptor = detections[0].descriptor;
        } else if (detections.length > 1) {
            captureStatus.textContent = 'Se detectó más de un rostro. Por favor, asegúrese de que solo aparezca una persona en cámara.';
            captureStatus.className = 'status error';
            document.getElementById('confirm-capture-btn').disabled = true;
            faceDescriptor = null;
        } else {
            captureStatus.textContent = 'No se detectó ningún rostro. Por favor, colóquese frente a la cámara.';
            captureStatus.className = 'status info';
            document.getElementById('confirm-capture-btn').disabled = true;
            faceDescriptor = null;
        }
    }, 100);
}

// Confirmar la captura facial y guardar el usuario
async function confirmCapture() {
    if (!faceDescriptor) {
        alert('No se ha detectado un rostro válido. Por favor, intente nuevamente.');
        return;
    }

    try {
        // Convertir el descriptor a array simple (faceapi usa Float32Array)
        currentUser.descriptor = Array.from(faceDescriptor);

        // Capturar imagen del video para save como foto
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        currentUser.foto = canvas.toDataURL('image/png');

        // Guardar usuario en el backend
        const result = await registerUser(currentUser);

        // Actualizar la base de datos local
        userDatabase.push(result.user);

        // Actualizar el faceMatcher con el nuevo usuario
        updateFaceMatcher();

        // Detener la cámara
        stopVideoStream();

        // Mostrar mensaje de éxito
        alert(`Usuario ${currentUser.nombre} registrado correctamente.`);

        // Limpiar los campos del formulario
        document.getElementById('operator-code').value = '';
        document.getElementById('operator-name').value = '';
        document.getElementById('operator-dni').value = '';
        document.getElementById('operator-level').value = '1';

        // Volver a la pantalla de inicio
        showScreen('home-screen');
    } catch (error) {
        console.error('Error al guardar el usuario:', error);
        alert(`Error al guardar el usuario: ${error.message}. Por favor, intente nuevamente.`);
    }
}

// Reiniciar la captura facial
function restartFaceCapture() {
    document.getElementById('confirm-capture-btn').disabled = true;
    captureStatus.textContent = 'Esperando detección facial...';
    captureStatus.className = 'status info';
    faceDescriptor = null;

    // Limpiar el canvas
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
}

// Iniciar el proceso de login facial
async function startFacialLogin(tipo) {
    currentLoginType = tipo;

    // Actualizar título y descripción según el tipo
    const titleElement = document.getElementById('login-title');
    const descriptionElement = document.getElementById('login-description');

    if (tipo === 'ingreso') {
        titleElement.textContent = 'Registro de Ingreso';
        descriptionElement.textContent = 'Por favor, colóquese frente a la cámara para registrar su ingreso.';
    } else {
        titleElement.textContent = 'Registro de Egreso';
        descriptionElement.textContent = 'Por favor, colóquese frente a la cámara para registrar su egreso.';
    }

    showScreen('login-screen');

    // Ocultar login manual inicialmente
    document.getElementById('manual-login').style.display = 'none';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 600, height: 450 }
        });
        loginVideo.srcObject = stream;

        // Esperar a que el video esté listo
        loginVideo.onloadedmetadata = () => {
            // Configurar canvas overlay
            loginOverlay.width = loginVideo.videoWidth;
            loginOverlay.height = loginVideo.videoHeight;

            // Iniciar reconocimiento facial
            startFacialRecognition();
        };
    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        loginStatus.textContent = 'Error: No se pudo acceder a la cámara. Asegúrese de permitir el acceso.';
        loginStatus.className = 'status error';
        showManualLoginOption();
    }
}

// Iniciar el reconocimiento facial para login
function startFacialRecognition() {
    const displaySize = { width: loginVideo.videoWidth, height: loginVideo.videoHeight };
    let countdown = 5;

    // Actualizar contador
    countdownElement.textContent = countdown;

    // Iniciar cuenta regresiva
    countdownInterval = setInterval(() => {
        countdown--;
        countdownElement.textContent = countdown;

        if (countdown <= 0) {
            clearInterval(countdownInterval);
            stopFacialRecognition();
            showManualLoginOption();
        }
    }, 1000);

    // Iniciar detección facial
    detectionInterval = setInterval(async () => {
        const detections = await faceapi
            .detectAllFaces(loginVideo, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptors();

        const ctx = loginOverlay.getContext('2d');
        ctx.clearRect(0, 0, loginOverlay.width, loginOverlay.height);

        // Dibujar detecciones
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(loginOverlay, resizedDetections);
        faceapi.draw.drawFaceLandmarks(loginOverlay, resizedDetections);

        // Verificar si se detectó al menos un rostro
        if (detections.length > 0 && faceMatcher) {
            const bestMatch = faceMatcher.findBestMatch(detections[0].descriptor);

            if (bestMatch && bestMatch.distance < 0.6) {
                // Usuario reconocido
                const user = userDatabase.find(u => u.codigo_empleado === bestMatch.label);
                if (user) {
                    stopFacialRecognition();
                    grantAccess(user);
                    return;
                }
            }
        }
    }, 100);
}

// Detener el reconocimiento facial
function stopFacialRecognition() {
    if (countdownInterval) clearInterval(countdownInterval);
    if (detectionInterval) clearInterval(detectionInterval);
    stopVideoStream();
}

// Detener la transmisión de video
function stopVideoStream() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }

    if (loginVideo.srcObject) {
        loginVideo.srcObject.getTracks().forEach(track => track.stop());
        loginVideo.srcObject = null;
    }

    // Limpiar canvases
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const loginCtx = loginOverlay.getContext('2d');
    loginCtx.clearRect(0, 0, loginOverlay.width, loginOverlay.height);
}

// Mostrar opción de login manual
function showManualLoginOption() {
    loginStatus.textContent = 'No se pudo reconocer su rostro. Por favor, use el inicio de sesión manual.';
    loginStatus.className = 'status error';
    const manualLoginElement = document.getElementById('manual-login');
    manualLoginElement.style.display = 'block';
    manualLoginElement.scrollIntoView({ behavior: 'smooth' });
}

// Intentar login manual
async function attemptManualLogin() {
    const operatorCode = document.getElementById('manual-operator-code').value;
    const operatorDni = document.getElementById('manual-operator-dni').value;

    if (!operatorCode || !operatorDni) {
        alert('Por favor, complete todos los campos.');
        return;
    }

    const user = userDatabase.find(u =>
        u.codigo_empleado === operatorCode && u.dni === operatorDni
    );

    if (user) {
        grantAccess(user);
    } else {
        denyAccess('Credenciales incorrectas. Verifique su código de operario y DNI.');
    }
}

// Otorgar acceso
async function grantAccess(user) {
    try {
        // Verificar si el usuario puede hacer este tipo de acceso
        const allUserRecords = accessRecords.filter(record => record.codigo_empleado === user.codigo_empleado);

        // Ordenar los registros por fecha para obtener el último correctamente
        allUserRecords.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

        let canAccess = true;
        let errorMessage = '';

        if (allUserRecords.length > 0) {
            const lastRecord = allUserRecords[0]; // El primer elemento después de ordenar descendentemente

            if (currentLoginType === 'ingreso' && lastRecord.tipo === 'ingreso') {
                canAccess = false;
                errorMessage = `${user.nombre}, ya se encuentra dentro del sistema. No puede ingresar nuevamente.`;
            } else if (currentLoginType === 'egreso' && lastRecord.tipo === 'egreso') {
                canAccess = false;
                errorMessage = `${user.nombre}, ya se encuentra fuera del sistema. No puede egresar nuevamente.`;
            }
        }

        if (!canAccess) {
            // Mostrar mensaje de error
            document.getElementById('denial-reason').textContent = errorMessage;
            showScreen('access-denied-screen');
            return;
        }

        // Registrar el acceso en el backend
        await registerAccess(user.codigo_empleado, currentLoginType);

        const tipoTexto = currentLoginType === 'ingreso' ? 'ingreso' : 'egreso';
        document.getElementById('welcome-message').textContent =
            `${user.nombre}, su ${tipoTexto} ha sido registrado correctamente.`;

        // Mostrar botón de menú solo si es ingreso y tiene nivel de acceso 3 o superior
        if (currentLoginType === 'ingreso' && user.nivel_acceso >= 3) {
            document.getElementById('go-to-menu-btn').style.display = 'block';
        } else {
            document.getElementById('go-to-menu-btn').style.display = 'none';
        }

        // Mostrar la pantalla de éxito
        console.log('Mostrando pantalla de éxito...');
        showScreen('access-granted-screen');

        // Agregar un pequeño delay para asegurar que la pantalla se muestre
        setTimeout(() => {
            console.log('Volviendo al inicio automáticamente...');
            // Volver automáticamente al inicio después de 8 segundos
            showScreen('home-screen');
        }, 8000);

    } catch (error) {
        console.error('Error al registrar acceso:', error);
        // Aún mostrar acceso permitido aunque falle el registro
        const tipoTexto = currentLoginType === 'ingreso' ? 'ingreso' : 'egreso';
        document.getElementById('welcome-message').textContent =
            `${user.nombre}, su ${tipoTexto} ha sido registrado correctamente.`;

        // Mostrar la pantalla de éxito
        console.log('Mostrando pantalla de éxito (fallback)...');
        showScreen('access-granted-screen');

        // Agregar un pequeño delay para asegurar que la pantalla se muestre
        setTimeout(() => {
            console.log('Volviendo al inicio automáticamente...');
            // Volver automáticamente al inicio después de 8 segundos
            showScreen('home-screen');
        }, 8000);
    }
}

// Denegar acceso
function denyAccess(reason) {
    document.getElementById('denial-reason').textContent = reason;
    showScreen('access-denied-screen');
}

// Actualizar el face matcher con los usuarios de la base de datos
function updateFaceMatcher() {
    if (userDatabase.length === 0) {
        faceMatcher = null;
        return;
    }

    // Crear labeledDescriptors a partir de la base de datos
    const labeledDescriptors = userDatabase.map(user => {
        if (user.descriptor && user.descriptor.length > 0) {
            return new faceapi.LabeledFaceDescriptors(
                user.codigo_empleado,
                [new Float32Array(user.descriptor)]
            );
        }
        return null;
    }).filter(desc => desc !== null);

    if (labeledDescriptors.length > 0) {
        faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    } else {
        faceMatcher = null;
    }
}

// Funciones para la pantalla de registros
function showRecordsScreen() {
    showScreen('records-screen');
    loadRecords();
}

async function loadRecords() {
    try {
        // Usar la variable global si está disponible, sino cargar desde el backend
        if (accessRecords.length === 0) {
            accessRecords = await fetchAccessRecords();
        }
        const users = await fetchUsers();

        // Crear un mapa de usuarios para acceso rápido
        const userMap = {};
        users.forEach(user => {
            userMap[user.codigo_empleado] = user;
        });

        // --- Lógica de Contadores Mejorada ---
        let peopleInside = 0;
        const userStatusMap = {};

        // 1. Determinar el estado de cada usuario basado en su último registro
        users.forEach(user => {
            const userRecords = accessRecords
                .filter(record => record.codigo_empleado === user.codigo_empleado)
                .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

            if (userRecords.length > 0) {
                userStatusMap[user.codigo_empleado] = userRecords[0].tipo; // 'ingreso' o 'egreso'
            } else {
                userStatusMap[user.codigo_empleado] = 'egreso'; // Por defecto, están fuera
            }
        });

        // 2. Contar personas dentro y fuera
        users.forEach(user => {
            if (userStatusMap[user.codigo_empleado] === 'ingreso') {
                peopleInside++;
            }
        });

        const peopleOutside = users.length - peopleInside;

        // Actualizar contadores en la UI
        document.getElementById('people-inside-count').textContent = peopleInside;
        document.getElementById('people-outside-count').textContent = peopleOutside;


        // --- Lógica de Tabla ---
        const tbody = document.getElementById('records-tbody');
        tbody.innerHTML = '';

        // Ordenar registros por fecha (más reciente primero)
        const sortedRecords = accessRecords.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

        sortedRecords.forEach(record => {
            const user = userMap[record.codigo_empleado];
            const userName = user ? user.nombre : 'Usuario Desconocido';
            const fecha = new Date(record.fecha_hora).toLocaleString('es-ES');
            const tipo = record.tipo === 'ingreso' ? 'Ingreso' : 'Egreso';
            // Usar el userStatusMap que ya calculamos para la tabla
            const estado = userStatusMap[record.codigo_empleado] === 'ingreso' ? 'Dentro' : 'Fuera';
            const estadoClass = userStatusMap[record.codigo_empleado] === 'ingreso' ? 'status-inside' : 'status-outside';

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

    } catch (error) {
        console.error('Error al cargar registros:', error);
        alert('Error al cargar los registros. Por favor, intente nuevamente.');
    }
}

// Función para verificar si un usuario puede hacer ingreso o egreso
function canUserAccess(userId, accessType) {
    // Obtener el último registro del usuario
    const userRecords = accessRecords.filter(record => record.codigo_empleado === userId);

    if (userRecords.length === 0) {
        // Si no hay registros, puede hacer cualquier cosa
        return true;
    }

    // El último registro determina qué puede hacer
    const lastRecord = userRecords[userRecords.length - 1];

    if (accessType === 'ingreso') {
        // Solo puede ingresar si su último registro fue egreso
        return lastRecord.tipo === 'egreso';
    } else {
        // Solo puede egresar si su último registro fue ingreso
        return lastRecord.tipo === 'ingreso';
    }
}

// Función para limpiar todos los registros
async function clearRecords() {
    const confirmation = confirm('¿Está seguro de que desea eliminar todos los registros de acceso? Esta acción no se puede deshacer.');

    if (confirmation) {
        try {
            await clearAccessRecords();

            // Limpiar la lista local
            accessRecords = [];

            // Volver a cargar la vista de registros (que ahora estará vacía)
            loadRecords();

            alert('Todos los registros de acceso han sido eliminados.');
        } catch (error) {
            console.error('Error al limpiar los registros:', error);
            alert('Hubo un error al intentar limpiar los registros. Por favor, intente nuevamente.');
        }
    }
}

// Función para reiniciar la base de datos de usuarios
async function resetUsers() {
    const confirmation = confirm('¿ESTÁ SEGURO DE QUE DESEA ELIMINAR A TODOS LOS USUARIOS? Esta acción es irreversible y también limpiará todos los registros de acceso.');

    if (confirmation) {
        try {
            // Primero limpiar registros, luego usuarios, para evitar registros huérfanos si algo falla
            await clearAccessRecords();
            await clearUsers();

            // Limpiar las listas locales
            accessRecords = [];
            userDatabase = [];

            // Actualizar el face matcher (quedará vacío)
            updateFaceMatcher();

            // Volver a cargar la vista de registros (que ahora estará vacía)
            loadRecords();

            alert('Todos los usuarios y registros de acceso han sido eliminados.');
        } catch (error) {
            console.error('Error al reiniciar la base de datos:', error);
            alert('Hubo un error al intentar reiniciar la base de datos. Por favor, intente nuevamente.');
        }
    }
}

// Inicializar la aplicación cuando se cargue la página
window.addEventListener('load', init);