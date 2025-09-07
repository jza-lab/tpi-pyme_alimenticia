let statsChartInstance = null;
let userAllowedZones = null; // Almacenar las zonas permitidas a nivel de módulo

// --- Renderizado de Gráficos ---
import { getUsers, getAccessRecords } from './state.js';

async function renderStage(stage) {
    const canvas = document.getElementById('statsCanvas');
    const ctx = canvas.getContext('2d');
    const insightsContainer = document.getElementById('insights-container');
    const insightsList = document.getElementById('insights-list');

    if (!canvas || !insightsContainer || !insightsList) return;

    insightsContainer.style.display = 'none';
    insightsList.innerHTML = '';
    if (statsChartInstance) statsChartInstance.destroy();

    try {
        const accessRecords = getAccessRecords();
        if (!accessRecords || accessRecords.length === 0) {
            throw new Error('No hay registros de acceso para mostrar estadísticas.');
        }

        let config;
        // Simplificaremos los gráficos para usar los datos reales que tenemos.
        // El OEE y otros indicadores complejos no se pueden calcular con los datos actuales.
        if (stage === 'Indicadores') {
            const ingresosPorHora = {};
            const egresosPorHora = {};
            for (let i = 0; i < 24; i++) {
                ingresosPorHora[i] = 0;
                egresosPorHora[i] = 0;
            }
            accessRecords.forEach(record => {
                const hour = new Date(record.fecha_hora).getHours();
                if (record.tipo === 'ingreso') {
                    ingresosPorHora[hour]++;
                } else {
                    egresosPorHora[hour]++;
                }
            });

            config = {
                type: 'bar',
                data: {
                    labels: Object.keys(ingresosPorHora).map(h => `${h}:00`),
                    datasets: [{
                        label: 'Ingresos por Hora',
                        data: Object.values(ingresosPorHora),
                        backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    }, {
                        label: 'Egresos por Hora',
                        data: Object.values(egresosPorHora),
                        backgroundColor: 'rgba(255, 99, 132, 0.7)',
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { title: { display: true, text: 'Flujo de Accesos por Hora' } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            };
        } else {
            // Gráfico de accesos por turno como ejemplo para las otras pestañas
            const accesosPorTurno = { 'Mañana': 0, 'Tarde': 0, 'Noche': 0 };
            const users = getUsers();
            const userMap = new Map(users.map(u => [u.codigo_empleado, u]));

            accessRecords.forEach(record => {
                const user = userMap.get(record.codigo_empleado);
                if (user && user.turno && accesosPorTurno.hasOwnProperty(user.turno)) {
                    accesosPorTurno[user.turno]++;
                }
            });

            config = {
                type: 'doughnut',
                data: {
                    labels: Object.keys(accesosPorTurno),
                    datasets: [{
                        label: 'Accesos por Turno',
                        data: Object.values(accesosPorTurno),
                        backgroundColor: ['rgba(255, 206, 86, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(153, 102, 255, 0.7)'],
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { title: { display: true, text: `Distribución de Accesos por Turno` } }
                }
            };
        }
        statsChartInstance = new Chart(ctx, config);
        document.getElementById('statsFallback').textContent = ''; // Limpiar mensaje de error
    } catch (err) {
        console.error(`Error en renderStage para ${stage}:`, err);
        document.getElementById('statsFallback').textContent = `Error al generar gráfico: ${err.message}`;
        document.getElementById('statsFallback').style.display = 'block';
    }
}

// --- Función de Inicialización Exportada ---
export function initializeStatistics(allowedZones) {
    userAllowedZones = allowedZones; // Almacenar las zonas para uso en renderStage
    const stageButtons = document.querySelectorAll('.stage-btn');

    // Ya no se filtra por zona, todos los botones son visibles por defecto si se tiene acceso a la sección.
    // Asegurarse de que los botones que podrían haber sido ocultados previamente ahora sean visibles.
    stageButtons.forEach(btn => {
        btn.style.display = '';
        btn.classList.remove('hidden-by-role');
    });

    stageButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const stage = e.currentTarget.dataset.stage;
            stageButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderStage(stage);
        });
    });

    // Activar el primer botón *visible*
    let initialActive = null;
    for (const btn of stageButtons) {
        if (btn.style.display !== 'none') {
            initialActive = btn;
            break;
        }
    }

    if (initialActive) {
        stageButtons.forEach(b => b.classList.remove('active'));
        initialActive.classList.add('active');
        renderStage(initialActive.dataset.stage);
    }
}