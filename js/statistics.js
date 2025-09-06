let statsChartInstance = null;
let userAllowedZones = null; // Almacenar las zonas permitidas a nivel de módulo

// --- Helpers para Gráficos ---
function getRandomColor() {
    const r = Math.floor(Math.random() * 255);
    const g = Math.floor(Math.random() * 255);
    const b = Math.floor(Math.random() * 255);
    return `rgba(${r}, ${g}, ${b}, 0.7)`;
}

function getColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(getRandomColor());
    }
    return colors;
}

// --- Lógica de Negocio para Estadísticas (OEE, Insights) ---
function generateInsights(allData, oeeResults) {
    const insights = [];
    const latestOeeData = oeeResults.datasets.oee.length > 0 ? oeeResults.datasets.oee[oeeResults.datasets.oee.length - 1] : null;

    if (latestOeeData && latestOeeData >= 0.85) {
        insights.push({ text: `¡Excelente! El OEE del último día (${(latestOeeData * 100).toFixed(1)}%) es de clase mundial.`, level: 'success' });
    }

    const recepcionData = allData.Recepcion || [];
    if (recepcionData.length > 0) {
        const totalRecibido = recepcionData.reduce((sum, item) => sum + item['Cantidad Recibida (en Kg)'], 0);
        const totalRechazado = recepcionData.filter(item => item.Decisión === 'Rechazado').reduce((sum, item) => sum + item['Cantidad Recibida (en Kg)'], 0);
        const rechazoRate = (totalRecibido > 0) ? (totalRechazado / totalRecibido) : 0;
        if (rechazoRate > 0.20) {
            insights.push({ text: `ALERTA: Alto porcentaje de rechazo de materias primas (${(rechazoRate * 100).toFixed(1)}%). Proveedores a revisar.`, level: 'alert' });
        } else if (rechazoRate < 0.05) {
            insights.push({ text: `BUEN TRABAJO: Tasa de rechazo de materia prima muy baja (${(rechazoRate * 100).toFixed(1)}%).`, level: 'success' });
        }
    }

    const procesamientoData = allData.Procesamiento || [];
    if (procesamientoData.length > 0) {
        const promedioDesperdicio = procesamientoData.reduce((sum, item) => sum + item['Desperdicio (en %)'], 0) / procesamientoData.length;
        const productosConAltoDesperdicio = procesamientoData.filter(item => item['Desperdicio (en %)'] > (promedioDesperdicio * 1.25));
        if (productosConAltoDesperdicio.length > 0) {
            const nombres = productosConAltoDesperdicio.map(p => `${p.Producto} (${p['Desperdicio (en %)']}%)`).join(', ');
            insights.push({ text: `ADVERTENCIA: Productos con desperdicio elevado: ${nombres}.`, level: 'warning' });
        }
    }
    return insights;
}

function calculateOEE(procesamientoData) {
    const idealCycleTimes_seconds = { 'Hamburguesas': 6, 'Milanesas': 6.5, 'Salchichas': 13, 'Albóndigas': 3.5, 'Nuggets': 5, 'Medallones': 5.5 };
    const dates = [...new Set(procesamientoData.map(p => p.Fecha))];
    const results = { labels: [], datasets: { availability: [], performance: [], quality: [], oee: [] } };

    dates.forEach(date => {
        const dailyData = procesamientoData.filter(p => p.Fecha === date);
        if (dailyData.length === 0) return;
        results.labels.push(new Date(date).toLocaleDateString('es-ES'));
        const unplannedStopTime_hours = 1, cleaningTimePerProcess_hours = 0.75;
        const numProcesses = dailyData.length;
        const totalCleaningTime_hours = (numProcesses > 1) ? (numProcesses - 1) * cleaningTimePerProcess_hours : 0;
        const totalStopTime_hours = unplannedStopTime_hours + totalCleaningTime_hours;
        const actualRunTime_hours = dailyData.reduce((sum, p) => sum + p['Tiempo de Operación (en Horas)'], 0);
        const plannedProductionTime_hours = actualRunTime_hours + totalStopTime_hours;
        const availability = (plannedProductionTime_hours > 0) ? actualRunTime_hours / plannedProductionTime_hours : 0;
        let totalGoodCount = 0, totalCount = 0;
        dailyData.forEach(p => {
            const processedCount = p['Cantidades Procesadas (en Unidades)'];
            const wastePercentage = p['Desperdicio (en %)'];
            totalGoodCount += processedCount * (1 - wastePercentage / 100);
            totalCount += processedCount;
        });
        const quality = (totalCount > 0) ? totalGoodCount / totalCount : 0;
        let totalNetRunTime_hours = 0;
        dailyData.forEach(p => {
            const idealCycle_seconds = idealCycleTimes_seconds[p.Producto];
            if (idealCycle_seconds) totalNetRunTime_hours += (idealCycle_seconds * p['Cantidades Procesadas (en Unidades)']) / 3600;
        });
        const performance = (actualRunTime_hours > 0) ? totalNetRunTime_hours / actualRunTime_hours : 0;
        results.datasets.availability.push(availability);
        results.datasets.performance.push(performance);
        results.datasets.quality.push(quality);
        results.datasets.oee.push(availability * performance * quality);
    });
    return results;
}

// --- Renderizado de Gráficos ---
async function renderStage(stage) {
    // **Validación de Seguridad**: Comprobar si el usuario tiene permiso para ver esta etapa
    if (userAllowedZones && stage !== 'Indicadores' && !userAllowedZones.includes(stage)) {
        console.warn(`Acceso no autorizado a la etapa "${stage}" denegado.`);
        document.getElementById('statsFallback').textContent = `No tiene permiso para ver la etapa: ${stage}.`;
        return;
    }

    const canvas = document.getElementById('statsCanvas');
    const ctx = canvas.getContext('2d');
    const insightsContainer = document.getElementById('insights-container');
    const insightsList = document.getElementById('insights-list');

    if (!canvas || !insightsContainer || !insightsList) return;

    insightsContainer.style.display = 'none';
    insightsList.innerHTML = '';
    if (statsChartInstance) statsChartInstance.destroy();

    try {
        const response = await fetch('data/statistics.json');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const allData = await response.json();

        let config;
        if (stage === 'Indicadores') {
            const oeeResults = calculateOEE(allData.Procesamiento);
            const insights = generateInsights(allData, oeeResults);
            if (insights.length > 0) {
                insightsList.innerHTML = insights.map(insight => `<div class="employee-card" style="border-left-color: ${insight.level === 'alert' ? '#e74c3c' : insight.level === 'warning' ? '#f39c12' : '#27ae60'}"><p>${insight.text}</p></div>`).join('');
                insightsContainer.style.display = 'block';
            }
            config = { type: 'bar', data: { labels: oeeResults.labels, datasets: [{ label: 'Disponibilidad', data: oeeResults.datasets.availability, backgroundColor: 'rgba(54, 162, 235, 0.7)' }, { label: 'Rendimiento', data: oeeResults.datasets.performance, backgroundColor: 'rgba(255, 206, 86, 0.7)' }, { label: 'Calidad', data: oeeResults.datasets.quality, backgroundColor: 'rgba(75, 192, 192, 0.7)' }, { label: 'OEE', data: oeeResults.datasets.oee, backgroundColor: 'rgba(153, 102, 255, 0.7)' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Indicador OEE por Día' } }, scales: { y: { beginAtZero: true, max: 1, ticks: { callback: v => (v * 100).toFixed(0) + '%' } } } } };
        } else {
            const stageData = allData[stage];
            if (!stageData || stageData.length === 0) throw new Error(`No hay datos para "${stage}"`);
            const labels = [...new Set(stageData.map(item => item.Producto || item.Proveedor || item.Tipo))];
            const data = labels.map(label => stageData.filter(item => (item.Producto || item.Proveedor || item.Tipo) === label).reduce((sum, item) => sum + (item['Cantidad Recibida (en Kg)'] || item['Cantidad almacenada (en Kg)'] || item['Cantidades Procesadas (en Unidades)'] || item['Cantidad envasada (en Unidades)'] || item['Cantidades despachadas (en unidades)']), 0));
            config = { type: 'bar', data: { labels, datasets: [{ label: `Datos para ${stage}`, data, backgroundColor: getColors(labels.length) }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `Análisis de ${stage}` } } } };
        }
        statsChartInstance = new Chart(ctx, config);
    } catch (err) {
        console.error(`Error en renderStage para ${stage}:`, err);
        document.getElementById('statsFallback').textContent = err.message;
    }
}

// --- Función de Inicialización Exportada ---
export function initializeStatistics(allowedZones) {
    userAllowedZones = allowedZones; // Almacenar las zonas para uso en renderStage
    const stageButtons = document.querySelectorAll('.stage-btn');
    
    // Si se proporcionan zonas permitidas (para un Supervisor o Analista), filtrar los botones
    if (userAllowedZones && Array.isArray(userAllowedZones)) {
        stageButtons.forEach(btn => {
            const stage = btn.dataset.stage;
            // El botón de Indicadores siempre es visible para quienes tienen acceso a estadísticas.
            if (stage !== 'Indicadores' && !userAllowedZones.includes(stage)) {
                btn.style.display = 'none';
                btn.classList.add('hidden-by-role');
            }
        });
    }
    // Si no se proporcionan allowedZones (Gerente), todos los botones permanecen visibles.

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