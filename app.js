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