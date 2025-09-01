import { FACE_API_CONFIG } from './config.js';

// Asegurarse que faceapi esté disponible en el scope global (cargado desde el HTML)
if (typeof faceapi === 'undefined') {
    console.error('face-api.js no se ha cargado. Asegúrate de que el script esté en tu HTML.');
    throw new Error('Dependencia crítica face-api.js no encontrada.');
}

let modelsLoaded = false;

/**
 * Carga todos los modelos necesarios de face-api.js.
 * Es seguro llamar a esta función varias veces; los modelos solo se cargarán una vez.
 */
export async function loadModels() {
    if (modelsLoaded || typeof faceapi === 'undefined') return;

    console.log('Cargando modelos de face-api...');
    try {
        // Usamos la URL del archivo de configuración
        const modelUrl = FACE_API_CONFIG.MODEL_URL;
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
            faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
            faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
            faceapi.nets.faceExpressionNet.loadFromUri(modelUrl)
        ]);
        modelsLoaded = true;
        console.log('Modelos de face-api cargados exitosamente.');
    } catch (error) {
        console.error('Error al cargar los modelos de face-api:', error);
        throw new Error('No se pudieron cargar los modelos de IA. La funcionalidad de reconocimiento no estará disponible.');
    }
}

/**
 * Crea y devuelve un FaceMatcher a partir de una lista de usuarios.
 * @param {Array} users - Lista de usuarios, cada uno con una propiedad `descriptor`.
 * @returns {faceapi.FaceMatcher | null} Una instancia de FaceMatcher o null si no hay descriptores válidos.
 */
export function createFaceMatcher(users) {
    if (!users || users.length === 0) return null;

    const labeledDescriptors = users
        .map(user => {
            // Asegurarse de que el descriptor es un array no vacío
            if (user.descriptor && user.descriptor.length > 0) {
                // Convertir el array normal a Float32Array, que es lo que espera face-api
                const descriptor = new Float32Array(user.descriptor);
                return new faceapi.LabeledFaceDescriptors(user.codigo_empleado, [descriptor]);
            }
            return null;
        })
        .filter(Boolean); // Filtrar cualquier usuario que no tuviera un descriptor válido

    if (labeledDescriptors.length === 0) return null;

    return new faceapi.FaceMatcher(labeledDescriptors, FACE_API_CONFIG.MATCH_THRESHOLD);
}

/**
 * Detecta un único rostro en un elemento de video y devuelve su descripción completa.
 * @param {HTMLVideoElement} videoEl - El elemento de video que se está analizando.
 * @returns {Promise<object | null>} La detección completa (con descriptor) o null si no se encuentra un rostro único.
 */
export async function getSingleFaceDetection(videoEl) {
    const options = new faceapi.TinyFaceDetectorOptions(FACE_API_CONFIG.TINY_FACE_DETECTOR_OPTIONS);
    const detections = await faceapi
        .detectAllFaces(videoEl, options)
        .withFaceLandmarks()
        .withFaceDescriptors();

    // Solo devolvemos un resultado si hay exactamente una persona en el cuadro
    if (detections.length !== 1) {
        return null;
    }
    return detections[0];
}

/**
 * Dibuja las detecciones faciales (caja, puntos) en un canvas superpuesto.
 * @param {HTMLVideoElement} videoEl - El elemento de video de origen para obtener las dimensiones.
 * @param {HTMLCanvasElement} canvasEl - El canvas sobre el que se va a dibujar.
 * @param {Array<object>} detections - Las detecciones a dibujar.
 */
export function drawDetections(videoEl, canvasEl, detections) {
    // Asegurarse de que el canvas y el video tengan las mismas dimensiones
    const displaySize = { width: videoEl.clientWidth, height: videoEl.clientHeight };
    faceapi.matchDimensions(canvasEl, displaySize);

    // Redimensionar las detecciones al tamaño del canvas
    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    // Limpiar el canvas y dibujar
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    faceapi.draw.drawDetections(canvasEl, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvasEl, resizedDetections);
}