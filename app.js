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
