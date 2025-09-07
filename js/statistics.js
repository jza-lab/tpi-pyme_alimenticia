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
    
    // Leer umbrales desde los inputs
    const rejectionThreshold = parseFloat(document.getElementById('rejection-threshold').value) / 100;
    const wasteThresholdMultiplier = parseFloat(document.getElementById('waste-threshold').value) / 100;

    const latestOeeData = oeeResults.datasets.oee.length > 0 ? oeeResults.datasets.oee[oeeResults.datasets.oee.length - 1] : null;

    if (latestOeeData && latestOeeData >= 0.85) {
        insights.push({ text: `¡Excelente! El OEE del último día (${(latestOeeData * 100).toFixed(1)}%) es de clase mundial.`, level: 'success' });
    }

    const recepcionData = allData.Recepcion || [];
    if (recepcionData.length > 0) {
        const totalRecibido = recepcionData.reduce((sum, item) => sum + item['Cantidad Recibida (en Kg)'], 0);
        const totalRechazado = recepcionData.filter(item => item.Decisión === 'Rechazado').reduce((sum, item) => sum + item['Cantidad Recibida (en Kg)'], 0);
        const rechazoRate = (totalRecibido > 0) ? (totalRechazado / totalRecibido) : 0;
        if (rechazoRate > rejectionThreshold) {
            insights.push({ text: `ALERTA: Tasa de rechazo de materia prima (${(rechazoRate * 100).toFixed(1)}%) supera el umbral del ${rejectionThreshold * 100}%.`, level: 'alert' });
        }
    }

    const procesamientoData = allData.Procesamiento || [];
    if (procesamientoData.length > 0) {
        const promedioDesperdicio = procesamientoData.reduce((sum, item) => sum + item['Desperdicio (en %)'], 0) / procesamientoData.length;
        const productosConAltoDesperdicio = procesamientoData.filter(item => item['Desperdicio (en %)'] > (promedioDesperdicio * (1 + wasteThresholdMultiplier)));
        if (productosConAltoDesperdicio.length > 0) {
            const nombres = productosConAltoDesperdicio.map(p => `${p.Producto} (${p['Desperdicio (en %)']}%)`).join(', ');
            insights.push({ text: `ADVERTENCIA: Productos con desperdicio un ${wasteThresholdMultiplier * 100}% por encima del promedio: ${nombres}.`, level: 'warning' });
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
let chartInstances = {};

function destroyCharts() {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
}

function createDoughnutChart(canvasId, label, value) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const percentage = (value * 100).toFixed(1);
    const data = {
        labels: [label, 'Restante'],
        datasets: [{
            data: [value, 1 - value],
            backgroundColor: [getColorForPercentage(value), '#e9ecef'],
            borderColor: [getColorForPercentage(value), '#e9ecef'],
            borderWidth: 1,
            circumference: 180,
            rotation: 270,
        }]
    };
    return new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
                title: { display: true, text: `${percentage}%`, font: { size: 24, weight: 'bold' }, position: 'top', padding: { top: 30 } }
            },
            cutout: '70%',
        }
    });
}

function getColorForPercentage(value) {
    if (value >= 0.85) return '#28a745'; // Verde (Bueno)
    if (value >= 0.70) return '#ffc107'; // Amarillo (Regular)
    return '#dc3545'; // Rojo (Malo)
}


async function renderStage(stage) {
    destroyCharts();
    const insightsContainer = document.getElementById('insights-container');
    const insightsList = document.getElementById('insights-list');
    const indicatorsView = document.getElementById('indicators-view');
    const stagesView = document.getElementById('stages-view');
    const fallback = document.getElementById('statsFallback');

    if (!insightsContainer || !insightsList || !indicatorsView || !stagesView) return;

    insightsContainer.style.display = 'none';
    insightsList.innerHTML = '';
    fallback.style.display = 'none';

    try {
        const response = await fetch('data/statistics.json');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const allData = await response.json();

        if (stage === 'Indicadores') {
            indicatorsView.style.display = 'block';
            stagesView.style.display = 'none';

            const oeeResults = calculateOEE(allData.Procesamiento);
            const insights = generateInsights(allData, oeeResults);

            if (insights.length > 0) {
                insightsList.innerHTML = insights.map(insight => `<div class="employee-card" style="border-left-color: ${insight.level === 'alert' ? '#e74c3c' : insight.level === 'warning' ? '#f39c12' : '#27ae60'}"><p>${insight.text}</p></div>`).join('');
                insightsContainer.style.display = 'block';
            }
            
            // Crear los 3 gráficos de dona
            const lastIndex = oeeResults.labels.length - 1;
            chartInstances.availability = createDoughnutChart('availabilityChart', 'Disponibilidad', oeeResults.datasets.availability[lastIndex]);
            chartInstances.performance = createDoughnutChart('performanceChart', 'Rendimiento', oeeResults.datasets.performance[lastIndex]);
            chartInstances.quality = createDoughnutChart('qualityChart', 'Calidad', oeeResults.datasets.quality[lastIndex]);

            // Crear el gráfico de tendencia OEE
            const oeeTrendCtx = document.getElementById('oeeTrendChart').getContext('2d');
            chartInstances.oeeTrend = new Chart(oeeTrendCtx, {
                type: 'line',
                data: {
                    labels: oeeResults.labels,
                    datasets: [{
                        label: 'OEE',
                        data: oeeResults.datasets.oee,
                        borderColor: '#0b4730',
                        backgroundColor: 'rgba(11, 71, 48, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { title: { display: false } },
                    scales: { y: { beginAtZero: true, max: 1, ticks: { callback: v => (v * 100).toFixed(0) + '%' } } }
                }
            });

        } else {
            indicatorsView.style.display = 'none';
            stagesView.style.display = 'block';
            
            const stageData = allData[stage];
            if (!stageData || stageData.length === 0) throw new Error(`No hay datos para "${stage}"`);
            
            const labels = [...new Set(stageData.map(item => item.Producto || item.Proveedor || item.Tipo))];
            const data = labels.map(label => stageData.filter(item => (item.Producto || item.Proveedor || item.Tipo) === label).reduce((sum, item) => sum + (item['Cantidad Recibida (en Kg)'] || item['Cantidad almacenada (en Kg)'] || item['Cantidades Procesadas (en Unidades)'] || item['Cantidad envasada (en Unidades)'] || item['Cantidades despachadas (en unidades)']), 0));
            
            const stagesCtx = document.getElementById('stagesChart').getContext('2d');
            chartInstances.stages = new Chart(stagesCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: `Datos para ${stage}`, data, backgroundColor: getColors(labels.length) }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `Análisis de ${stage}` } } }
            });
        }
    } catch (err) {
        console.error(`Error en renderStage para ${stage}:`, err);
        fallback.textContent = err.message;
        fallback.style.display = 'block';
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

    // Add event listeners for alert configuration inputs
    document.getElementById('rejection-threshold').addEventListener('change', () => {
        if (document.querySelector('.stage-btn.active')?.dataset.stage === 'Indicadores') {
            renderStage('Indicadores');
        }
    });
    document.getElementById('waste-threshold').addEventListener('change', () => {
        if (document.querySelector('.stage-btn.active')?.dataset.stage === 'Indicadores') {
            renderStage('Indicadores');
        }
    });
}