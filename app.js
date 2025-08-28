// Configuración de la API
const API_BASE_URL = 'http://localhost:3000/api';

// Variables globales
let currentUser = null;
let faceDescriptor = null;
let faceMatcher = null;
let countdownInterval = null;
let detectionInterval = null;
let userDatabase = []; // Se cargará desde el backend
let accessRecords = []; // Se cargará desde el backend
let currentLoginType = 'ingreso'; // Tipo de login actual (ingreso/egreso)

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
document.getElementById('clear-records-btn').addEventListener('click', clearRecords);
document.getElementById('reset-users-btn').addEventListener('click', resetUsers);

// Funciones de API
async function fetchUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/users`);
        if (!response.ok) throw new Error('Error al cargar usuarios');
        return await response.json();
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        return [];
    }
}

async function fetchAccessRecords() {
    try {
        const response = await fetch(`${API_BASE_URL}/access`);
        if (!response.ok) throw new Error('Error al cargar registros de acceso');
        return await response.json();
    } catch (error) {
        console.error('Error al cargar registros de acceso:', error);
        return [];
    }
}

async function clearAccessRecords() {
    try {
        const response = await fetch(`${API_BASE_URL}/access`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Error al limpiar registros');
        return await response.json();
    } catch (error) {
        console.error('Error al limpiar registros:', error);
        throw error;
    }
}

async function clearUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/users`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Error al reiniciar usuarios');
        return await response.json();
    } catch (error) {
        console.error('Error al reiniciar usuarios:', error);
        throw error;
    }
}

async function registerUser(userData) {
    try {
        // Crear FormData para enviar la imagen
        const formData = new FormData();
        formData.append('codigo_operario', userData.codigo_operario);
        formData.append('nombre', userData.nombre);
        formData.append('dni', userData.dni);
        formData.append('descriptor', JSON.stringify(userData.descriptor));
        
        // Convertir base64 a blob para la imagen
        if (userData.foto) {
            const response = await fetch(userData.foto);
            const blob = await response.blob();
            formData.append('foto', blob, 'foto.png');
        }

        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al registrar usuario');
        }

        return await response.json();
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        throw error;
    }
}

async function registerAccess(codigoOperario, tipo) {
    try {
        const response = await fetch(`${API_BASE_URL}/access`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                codigo_operario: codigoOperario,
                tipo: tipo
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al registrar acceso');
        }

        const result = await response.json();
        
        // Agregar el nuevo registro a la lista local
        accessRecords.push({
            codigo_operario: codigoOperario,
            tipo: tipo,
            fecha_hora: new Date().toISOString()
        });
        
        return result;
    } catch (error) {
        console.error('Error al registrar acceso:', error);
        throw error;
    }
}

// Inicializar la aplicación
async function init() {
    try {
        // Cargar modelos de face-api.js desde el backend
        const MODEL_BASE_URL = 'http://localhost:3000/models';

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
        alert('Error al inicializar la aplicación. Asegúrese de que el backend esté ejecutándose en http://localhost:3000');
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
    
    // Validar campos
    if (!operatorCode || !operatorName || !operatorDni) {
        alert('Por favor, complete todos los campos antes de continuar.');
        return;
    }
    // Verificar si el código de operario ya existe
    if (userDatabase.find(user => user.codigo_operario === operatorCode)) {
        alert('Este código de operario ya está registrado. Por favor, use otro.');
        return;
    }
    // Verificar si el DNI ya existe
    if(userDatabase.find(user => user.dni === operatorDni)) {
        alert('Este DNI ya está registrado. Por favor, use otro.');
        return;
    }
    // Guardar datos del usuario temporalmente
    currentUser = {
        codigo_operario: operatorCode,
        nombre: operatorName,
        dni: operatorDni,
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
        
        // Capturar imagen del video para guardar como foto
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
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        
        // Dibujar detecciones
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(loginOverlay, resizedDetections);
        faceapi.draw.drawFaceLandmarks(loginOverlay, resizedDetections);
        
        // Verificar si se detectó al menos un rostro
        if (detections.length > 0 && faceMatcher) {
            const bestMatch = faceMatcher.findBestMatch(detections[0].descriptor);
            
            if (bestMatch && bestMatch.distance < 0.6) {
                // Usuario reconocido
                const user = userDatabase.find(u => u.codigo_operario === bestMatch.label);
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
