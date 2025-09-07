import { getUsers, getAccessRecords } from './state.js';
import {
    fetchRecepcionData,
    fetchAlmacenamientoData,
    fetchProcesamientoData,
    fetchConservacionData,
    fetchDespachoData
} from './api.js';

let userAllowedZones = null;

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

// --- Función para generar datos simulados de OEE ---
function generateSimulatedOEEData() {
    const today = new Date();
    const labels = [];
    const availability = [];
    const performance = [];
    const quality = [];
    const oee = [];

    // Generar datos para los últimos 7 días
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('es-ES'));

        // Generar valores simulados realistas
        const avail = 0.75 + Math.random() * 0.20; // 75-95%
        const perf = 0.70 + Math.random() * 0.25;  // 70-95%
        const qual = 0.85 + Math.random() * 0.12;  // 85-97%

        availability.push(avail);
        performance.push(perf);
        quality.push(qual);
        oee.push(avail * perf * qual);
    }

    return {
        labels,
        datasets: {
            availability,
            performance,
            quality,
            oee
        }
    };
}

// --- Lógica de Negocio para Estadísticas ---

// Función para verificar si los datos de procesamiento son válidos para OEE
function isOEEDataUsable(data) {
    return data && data.length > 0 &&
        data.every(p =>
            p.hasOwnProperty('Fecha') &&
            p.hasOwnProperty('Tiempo de Operación (en Horas)') &&
            p.hasOwnProperty('Cantidades Procesadas (en Unidades)') &&
            p.hasOwnProperty('Desperdicio (en %)') &&
            p.hasOwnProperty('Producto')
        );
}

// Funciones de cálculo para KPIs individuales
function calculateRejectionRate(recepcionData) {
    if (!recepcionData || recepcionData.length === 0) return 0;
    const totalRecibido = recepcionData.reduce((sum, item) => {
        const cantidad = parseFloat(item['Cantidad Recibida (en Kg)']);
        return sum + (isNaN(cantidad) ? 0 : cantidad);
    }, 0);
    const totalRechazado = recepcionData
        .filter(item => item.Decisión === 'Rechazado')
        .reduce((sum, item) => {
            const cantidad = parseFloat(item['Cantidad Recibida (en Kg)']);
            return sum + (isNaN(cantidad) ? 0 : cantidad);
        }, 0);
    return totalRecibido > 0 ? totalRechazado / totalRecibido : 0;
}

function calculateYield(procesamientoData) {
    if (!isOEEDataUsable(procesamientoData)) return 0;
    let totalGoodCount = 0;
    let totalCount = 0;
    procesamientoData.forEach(p => {
        const processedCount = parseFloat(p['Cantidades Procesadas (en Unidades)']) || 0;
        const wastePercentage = parseFloat(p['Desperdicio (en %)']) || 0;
        if (!isNaN(processedCount) && !isNaN(wastePercentage)) {
            totalGoodCount += processedCount * (1 - wastePercentage / 100);
            totalCount += processedCount;
        }
    });
    return totalCount > 0 ? totalGoodCount / totalCount : 0.92; // Retornar un valor por defecto si no hay datos
}

function calculateDocumentationCompliance(despachoData) {
    if (!despachoData || despachoData.length === 0) return 0.95; // Retornar un valor por defecto
    const totalDespachos = despachoData.length;
    const completos = despachoData.filter(item => item['Documentación completa'] === 'Si').length;
    return totalDespachos > 0 ? completos / totalDespachos : 0;
}


// Genera alertas y observaciones basadas en los datos
function generateInsights(allData, oeeResults) {
    const insights = [];
    const alerts = {
        rejectionRate: false,
        oee: 'ok'
    };

    const rejectionThreshold = parseFloat(document.getElementById('rejection-threshold').value) / 100;
    const wasteThresholdMultiplier = parseFloat(document.getElementById('waste-threshold').value) / 100;
    
    const latestOee = oeeResults.datasets.oee.length > 0 ? oeeResults.datasets.oee[oeeResults.datasets.oee.length - 1] : null;
    if (latestOee !== null) {
        if (latestOee >= 0.85) {
            insights.push({ text: `¡Excelente! El OEE del último día (${(latestOee * 100).toFixed(1)}%) es de clase mundial.`, level: 'success' });
            alerts.oee = 'success';
        } else if (latestOee < 0.60) {
            insights.push({ text: `ALERTA: El OEE del último día (${(latestOee * 100).toFixed(1)}%) está por debajo del nivel aceptable.`, level: 'alert' });
            alerts.oee = 'alert';
        } else {
            insights.push({ text: `El OEE actual (${(latestOee * 100).toFixed(1)}%) tiene margen de mejora. Meta: >85%`, level: 'warning' });
            alerts.oee = 'warning';
        }
    }

    const rejectionRate = calculateRejectionRate(allData.Recepcion);
    if (rejectionRate > rejectionThreshold) {
        insights.push({ text: `ALERTA: Tasa de rechazo de materia prima (${(rejectionRate * 100).toFixed(1)}%) supera el umbral del ${rejectionThreshold * 100}%.`, level: 'alert', kpi: 'rejectionRate' });
        alerts.rejectionRate = true;
    }

    if (isOEEDataUsable(allData.Procesamiento)) {
        const wasteValues = allData.Procesamiento.map(p => parseFloat(p['Desperdicio (en %)'])).filter(v => !isNaN(v));
        if (wasteValues.length > 0) {
            const avgWaste = wasteValues.reduce((s, v) => s + v, 0) / wasteValues.length;
            const highWasteProducts = allData.Procesamiento.filter(p => {
                const waste = parseFloat(p['Desperdicio (en %)']);
                return !isNaN(waste) && waste > avgWaste * (1 + wasteThresholdMultiplier);
            });
            if (highWasteProducts.length > 0) {
                const names = highWasteProducts.map(p => `${p.Producto} (${p['Desperdicio (en %)']}%)`).join(', ');
                insights.push({ text: `ADVERTENCIA: Productos con desperdicio un ${wasteThresholdMultiplier * 100}% por encima del promedio: ${names}.`, level: 'warning' });
            }
        }
    } else if (!allData.Procesamiento) {
         insights.push({ text: `Los datos de OEE mostrados son simulados. Conecte con la base de datos de procesamiento para obtener métricas reales.`, level: 'warning' });
    }
    
    return { insights, alerts };
}


function calculateOEE(procesamientoData) {
    if (!isOEEDataUsable(procesamientoData)) {
        console.warn('Datos de procesamiento no disponibles o con formato incorrecto. Usando datos simulados para OEE.');
        return generateSimulatedOEEData();
    }

    const idealCycleTimes_seconds = { 
        'Hamburguesas': 6, 'Milanesas': 6.5, 'Salchichas': 13, 
        'Albóndigas': 3.5, 'Nuggets': 5, 'Medallones': 5.5 
    };
    
    const dates = [...new Set(procesamientoData.map(p => p.Fecha))].sort((a, b) => new Date(a) - new Date(b));
    const results = { labels: [], datasets: { availability: [], performance: [], quality: [], oee: [] } };

    if (dates.length === 0) return generateSimulatedOEEData();

    dates.forEach(date => {
        const dailyData = procesamientoData.filter(p => p.Fecha === date);
        if (dailyData.length === 0) return;
        
        results.labels.push(new Date(date).toLocaleDateString('es-ES'));
        
        const unplannedStopTime_hours = 1;
        const cleaningTimePerProcess_hours = 0.5;
        const numProcesses = dailyData.length;
        const totalCleaningTime_hours = (numProcesses > 1) ? (numProcesses - 1) * cleaningTimePerProcess_hours : 0;
        const totalStopTime_hours = unplannedStopTime_hours + totalCleaningTime_hours;

        const actualRunTime_hours = dailyData.reduce((sum, p) => {
            const time = parseFloat(p['Tiempo de Operación (en Horas)']);
            return sum + (isNaN(time) ? 8 : time);
        }, 0);

        const plannedProductionTime_hours = actualRunTime_hours + totalStopTime_hours;
        let availability = (plannedProductionTime_hours > 0) ? actualRunTime_hours / plannedProductionTime_hours : 0;
        availability = Math.min(1, Math.max(0, availability));

        let totalGoodCount = 0, totalCount = 0;
        dailyData.forEach(p => {
            const processedCount = parseFloat(p['Cantidades Procesadas (en Unidades)']) || 100;
            const wastePercentage = parseFloat(p['Desperdicio (en %)']) || 5;
            totalGoodCount += processedCount * (1 - wastePercentage / 100);
            totalCount += processedCount;
        });
        
        let quality = (totalCount > 0) ? totalGoodCount / totalCount : 0.95;
        quality = Math.min(1, Math.max(0, quality));

        let totalNetRunTime_hours = 0;
        dailyData.forEach(p => {
            const idealCycle_seconds = idealCycleTimes_seconds[p.Producto] || 6;
            const processedCount = parseFloat(p['Cantidades Procesadas (en Unidades)']) || 100;
            totalNetRunTime_hours += (idealCycle_seconds * processedCount) / 3600;
        });
        
        let performance = (actualRunTime_hours > 0) ? totalNetRunTime_hours / actualRunTime_hours : 0.80;
        performance = Math.min(1, Math.max(0, performance));
        
        results.datasets.availability.push(availability);
        results.datasets.performance.push(performance);
        results.datasets.quality.push(quality);
        results.datasets.oee.push(availability * performance * quality);
    });

    if (results.labels.length === 0) return generateSimulatedOEEData();
    return results;
}

// --- Renderizado de Gráficos ---
let chartInstances = {};

function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    chartInstances = {};
}

function createDoughnutChart(canvasId, label, value, inverted = false) {
    try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Canvas con ID ${canvasId} no encontrado`);
            return null;
        }
        const ctx = canvas.getContext('2d');
        
        const displayValue = inverted ? 1 - value : value;
        const percentage = (value * 100).toFixed(1);
        
        const data = {
            labels: [label, 'Restante'],
            datasets: [{
                data: [displayValue, 1 - displayValue],
                backgroundColor: [getColorForPercentage(value, inverted), '#e9ecef'],
                borderColor: [getColorForPercentage(value, inverted), '#e9ecef'],
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
                    tooltip: { 
                        enabled: true,
                        callbacks: {
                            label: (context) => `${context.label}: ${(value * 100).toFixed(1)}%`
                        }
                    },
                    title: { 
                        display: true, 
                        text: `${percentage}%`, 
                        font: { size: 24, weight: 'bold' }, 
                        position: 'top', 
                        padding: { top: 30 } 
                    }
                },
                cutout: '70%',
            }
        });
    } catch (error) {
        console.error(`Error creando gráfico ${canvasId}:`, error);
        return null;
    }
}

function getColorForPercentage(value, inverted = false) {
    const score = inverted ? 1 - value : value;
    if (score >= 0.85) return '#28a745'; // Verde (Bueno)
    if (score >= 0.70) return '#ffc107'; // Amarillo (Regular)
    return '#dc3545'; // Rojo (Malo)
}

function setChartAlertState(cardId, isAlert) {
    const card = document.getElementById(cardId);
    if (card) {
        if (isAlert) {
            card.classList.add('alert-active');
        } else {
            card.classList.remove('alert-active');
        }
    }
}

// [Las funciones render específicas se mantienen igual...]
function renderDespachoCharts(stageData) {
    // Chart 1: Cantidades Despachadas por Destino
    const byDestination = stageData.reduce((acc, item) => {
        const destination = item.Destino;
        const quantity = parseFloat(item['Cantidades despachadas (en unidades)']) || 0;
        acc[destination] = (acc[destination] || 0) + quantity;
        return acc;
    }, {});

    const ctx1 = document.getElementById('despachoChart1');
    if (ctx1) {
        chartInstances.despacho_destination = new Chart(ctx1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(byDestination),
                datasets: [{
                    label: 'Cantidad Despachada (Unidades)',
                    data: Object.values(byDestination),
                    backgroundColor: getColors(Object.keys(byDestination).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Cantidades Despachadas por Destino'
                    }
                }
            }
        });
    }

    // Chart 2: Estado de la Documentación
    const documentation = stageData.reduce((acc, item) => {
        const status = item['Documentación completa'] || 'No especificado';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const ctx2 = document.getElementById('despachoChart2');
    if (ctx2) {
        chartInstances.despacho_documentation = new Chart(ctx2.getContext('2d'), {
            type: 'pie',
            data: {
                labels: Object.keys(documentation),
                datasets: [{
                    data: Object.values(documentation),
                    backgroundColor: ['#28a745', '#dc3545', '#ffc107']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Estado de la Documentación'
                    }
                }
            }
        });
    }

    // Chart 3: Tiempo Promedio en Tránsito por Destino
    const transitByDestination = stageData.reduce((acc, item) => {
        const destination = item.Destino;
        const time = parseFloat(item['Tiempo en transito (en Horas)']);
        if (!isNaN(time)) {
            if (!acc[destination]) {
                acc[destination] = { sum: 0, count: 0 };
            }
            acc[destination].sum += time;
            acc[destination].count++;
        }
        return acc;
    }, {});

    const avgTime = Object.keys(transitByDestination).map(destination => ({
        destination,
        avg: transitByDestination[destination].sum / transitByDestination[destination].count
    }));

    const ctx3 = document.getElementById('despachoChart3');
    if (ctx3) {
        chartInstances.despacho_transit = new Chart(ctx3.getContext('2d'), {
            type: 'bar',
            data: {
                labels: avgTime.map(d => d.destination),
                datasets: [{
                    label: 'Tiempo Promedio (Horas)',
                    data: avgTime.map(d => d.avg),
                    backgroundColor: getColors(avgTime.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Tiempo Promedio en Tránsito por Destino'
                    }
                }
            }
        });
    }
}

function renderConservacionCharts(stageData) {
    // Chart 1: Cantidad Envasada por Producto
    const byProduct = stageData.reduce((acc, item) => {
        const product = item.Producto;
        const quantity = parseFloat(item['Cantidad envasada (en Unidades)']) || 0;
        acc[product] = (acc[product] || 0) + quantity;
        return acc;
    }, {});

    const ctx1 = document.getElementById('conservacionChart1');
    if (ctx1) {
        chartInstances.conservacion_product = new Chart(ctx1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(byProduct),
                datasets: [{
                    label: 'Cantidad Envasada (Unidades)',
                    data: Object.values(byProduct),
                    backgroundColor: getColors(Object.keys(byProduct).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Cantidad Envasada por Producto'
                    }
                }
            }
        });
    }

    // Chart 2: Métodos de Conservación Utilizados
    const methods = stageData.reduce((acc, item) => {
        const method = item['Método de Conservación'];
        acc[method] = (acc[method] || 0) + 1;
        return acc;
    }, {});

    const ctx2 = document.getElementById('conservacionChart2');
    if (ctx2) {
        chartInstances.conservacion_methods = new Chart(ctx2.getContext('2d'), {
            type: 'pie',
            data: {
                labels: Object.keys(methods),
                datasets: [{
                    data: Object.values(methods),
                    backgroundColor: getColors(Object.keys(methods).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Métodos de Conservación Utilizados'
                    }
                }
            }
        });
    }

    // Chart 3: Vida Útil Promedio por Producto
    const lifeByProduct = stageData.reduce((acc, item) => {
        const product = item.Producto;
        const life = parseFloat(item['Vida útil (en Dias)']);
        if (!isNaN(life)) {
            if (!acc[product]) {
                acc[product] = { sum: 0, count: 0 };
            }
            acc[product].sum += life;
            acc[product].count++;
        }
        return acc;
    }, {});

    const avgLife = Object.keys(lifeByProduct).map(product => ({
        product,
        avg: lifeByProduct[product].sum / lifeByProduct[product].count
    }));

    const ctx3 = document.getElementById('conservacionChart3');
    if (ctx3) {
        chartInstances.conservacion_life = new Chart(ctx3.getContext('2d'), {
            type: 'bar',
            data: {
                labels: avgLife.map(d => d.product),
                datasets: [{
                    label: 'Vida Útil Promedio (Días)',
                    data: avgLife.map(d => d.avg),
                    backgroundColor: getColors(avgLife.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Vida Útil Promedio por Producto'
                    }
                }
            }
        });
    }
}

function renderProcesamientoCharts(stageData) {
    // Chart 1: Cantidades Procesadas por Producto
    const byProduct = stageData.reduce((acc, item) => {
        const product = item.Producto;
        const quantity = parseFloat(item['Cantidades Procesadas (en Unidades)']) || 0;
        acc[product] = (acc[product] || 0) + quantity;
        return acc;
    }, {});

    const ctx1 = document.getElementById('procesamientoChart1');
    if (ctx1) {
        chartInstances.procesamiento_product = new Chart(ctx1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(byProduct),
                datasets: [{
                    label: 'Cantidad Procesada (Unidades)',
                    data: Object.values(byProduct),
                    backgroundColor: getColors(Object.keys(byProduct).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Cantidades Procesadas por Producto'
                    }
                }
            }
        });
    }

    // Chart 2: Rendimiento Promedio por Producto
    const performanceByProduct = stageData.reduce((acc, item) => {
        const product = item.Producto;
        const performance = parseFloat(item['Rendimiento (en %)']);
        if (!isNaN(performance)) {
            if (!acc[product]) {
                acc[product] = { sum: 0, count: 0 };
            }
            acc[product].sum += performance;
            acc[product].count++;
        }
        return acc;
    }, {});

    const avgPerformance = Object.keys(performanceByProduct).map(product => ({
        product,
        avg: performanceByProduct[product].sum / performanceByProduct[product].count
    }));

    const ctx2 = document.getElementById('procesamientoChart2');
    if (ctx2) {
        chartInstances.procesamiento_performance = new Chart(ctx2.getContext('2d'), {
            type: 'bar',
            data: {
                labels: avgPerformance.map(d => d.product),
                datasets: [{
                    label: 'Rendimiento Promedio (%)',
                    data: avgPerformance.map(d => d.avg),
                    backgroundColor: getColors(avgPerformance.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Rendimiento Promedio por Producto'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + '%'
                            }
                        }
                    }
                }
            }
        });
    }

    // Chart 3: Distribución de Riesgos en Procesamiento
    const risks = stageData.reduce((acc, item) => {
        const risk = item.Riesgo || 'Sin riesgo';
        acc[risk] = (acc[risk] || 0) + 1;
        return acc;
    }, {});

    const ctx3 = document.getElementById('procesamientoChart3');
    if (ctx3) {
        chartInstances.procesamiento_risks = new Chart(ctx3.getContext('2d'), {
            type: 'pie',
            data: {
                labels: Object.keys(risks),
                datasets: [{
                    data: Object.values(risks),
                    backgroundColor: getColors(Object.keys(risks).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribución de Riesgos en Procesamiento'
                    }
                }
            }
        });
    }
}

function renderAlmacenamientoCharts(stageData) {
    // Chart 1: Cantidad Almacenada por Ubicación
    const byLocation = stageData.reduce((acc, item) => {
        const location = item['Ubicación'];
        const quantity = parseFloat(item['Cantidad almacenada (en Kg)']) || 0;
        acc[location] = (acc[location] || 0) + quantity;
        return acc;
    }, {});

    const ctx1 = document.getElementById('almacenamientoChart1');
    if (ctx1) {
        chartInstances.almacenamiento_location = new Chart(ctx1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(byLocation),
                datasets: [{
                    label: 'Cantidad Almacenada (Kg)',
                    data: Object.values(byLocation),
                    backgroundColor: getColors(Object.keys(byLocation).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Cantidad Almacenada por Ubicación'
                    }
                }
            }
        });
    }

    // Chart 2: Riesgos de Almacenamiento
    const risks = stageData.reduce((acc, item) => {
        const risk = item.Riesgo || 'Sin riesgo';
        acc[risk] = (acc[risk] || 0) + 1;
        return acc;
    }, {});

    const ctx2 = document.getElementById('almacenamientoChart2');
    if (ctx2) {
        chartInstances.almacenamiento_risks = new Chart(ctx2.getContext('2d'), {
            type: 'pie',
            data: {
                labels: Object.keys(risks),
                datasets: [{
                    data: Object.values(risks),
                    backgroundColor: getColors(Object.keys(risks).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Conteo de Riesgos de Almacenamiento'
                    }
                }
            }
        });
    }

    // Chart 3: Humedad Promedio por Ubicación
    const humidityByLocation = stageData.reduce((acc, item) => {
        const location = item['Ubicación'];
        const humidity = parseFloat(item['Humedad (en %)']);
        if (!isNaN(humidity)) {
            if (!acc[location]) {
                acc[location] = { sum: 0, count: 0 };
            }
            acc[location].sum += humidity;
            acc[location].count++;
        }
        return acc;
    }, {});

    const avgHumidity = Object.keys(humidityByLocation).map(location => ({
        location,
        avg: humidityByLocation[location].sum / humidityByLocation[location].count
    }));

    const ctx3 = document.getElementById('almacenamientoChart3');
    if (ctx3) {
        chartInstances.almacenamiento_humidity = new Chart(ctx3.getContext('2d'), {
            type: 'bar',
            data: {
                labels: avgHumidity.map(d => d.location),
                datasets: [{
                    label: 'Humedad Promedio (%)',
                    data: avgHumidity.map(d => d.avg),
                    backgroundColor: getColors(avgHumidity.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Humedad Promedio por Ubicación'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + '%'
                            }
                        }
                    }
                }
            }
        });
    }
}

function renderRecepcionCharts(stageData) {
    // Chart 1: Cantidad Recibida por Proveedor
    const byProvider = stageData.reduce((acc, item) => {
        const provider = item.Proveedor;
        const quantity = parseFloat(item['Cantidad Recibida (en Kg)']) || 0;
        acc[provider] = (acc[provider] || 0) + quantity;
        return acc;
    }, {});

    const ctx1 = document.getElementById('recepcionChart1');
    if (ctx1) {
        chartInstances.recepcion_provider = new Chart(ctx1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(byProvider),
                datasets: [{
                    label: 'Cantidad Recibida (Kg)',
                    data: Object.values(byProvider),
                    backgroundColor: getColors(Object.keys(byProvider).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Cantidad Recibida por Proveedor'
                    }
                }
            }
        });
    }

    // Chart 2: Decisiones de Aceptación/Rechazo
    const decisions = stageData.reduce((acc, item) => {
        const decision = item.Decisión;
        acc[decision] = (acc[decision] || 0) + 1;
        return acc;
    }, {});

    const ctx2 = document.getElementById('recepcionChart2');
    if (ctx2) {
        chartInstances.recepcion_decisions = new Chart(ctx2.getContext('2d'), {
            type: 'pie',
            data: {
                labels: Object.keys(decisions),
                datasets: [{
                    data: Object.values(decisions),
                    backgroundColor: ['#28a745', '#dc3545', '#ffc107']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Decisiones de Aceptación/Rechazo'
                    }
                }
            }
        });
    }

    // Chart 3: Distribución de Tipos de Producto
    const byType = stageData.reduce((acc, item) => {
        const type = item.Tipo;
        const quantity = parseFloat(item['Cantidad Recibida (en Kg)']) || 0;
        acc[type] = (acc[type] || 0) + quantity;
        return acc;
    }, {});

    const ctx3 = document.getElementById('recepcionChart3');
    if (ctx3) {
        chartInstances.recepcion_type = new Chart(ctx3.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(byType),
                datasets: [{
                    label: 'Distribución (Kg)',
                    data: Object.values(byType),
                    backgroundColor: getColors(Object.keys(byType).length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribución de Tipos de Producto (Kg)'
                    }
                }
            }
        });
    }
}

async function renderStage(stage) {
    destroyCharts();

    const alertsConfigContainer = document.getElementById('alerts-config-container');
    if (alertsConfigContainer) {
        alertsConfigContainer.style.display = stage === 'Indicadores' ? 'block' : 'none';
    }

    const insightsContainer = document.getElementById('insights-container');
    const insightsList = document.getElementById('insights-list');
    const indicatorsView = document.getElementById('indicators-view');
    const stagesView = document.getElementById('stages-view');
    const accessChartsView = document.getElementById('access-charts-view');
    const fallback = document.getElementById('statsFallback');

    if (!insightsContainer || !insightsList || !indicatorsView || !stagesView || !fallback || !accessChartsView) {
        console.error('Algunos elementos del DOM no se encontraron');
        return;
    }

    insightsContainer.style.display = 'none';
    insightsList.innerHTML = '';
    fallback.style.display = 'none';
    indicatorsView.style.display = 'none';
    stagesView.style.display = 'none';
    accessChartsView.style.display = 'none';

    try {
        if (stage === 'Accesos') {
            accessChartsView.style.display = 'block';
            const users = getUsers();
            const accessRecords = getAccessRecords();

            const onTimeThreshold = 15;
            const arrivals = { onTime: 0, late: 0 };
            const shiftStartTimes = { 'Mañana': 6, 'Tarde': 14, 'Noche': 22 };
            
            accessRecords.filter(r => r.tipo === 'ingreso').forEach(record => {
                const user = users.find(u => u.codigo_empleado === record.codigo_empleado);
                if (user && user.turno) {
                    const recordDate = new Date(record.fecha_hora);
                    const recordHour = recordDate.getHours();
                    const recordMinute = recordDate.getMinutes();
                    const shiftStartHour = shiftStartTimes[user.turno];
                    if (recordHour > shiftStartHour || (recordHour === shiftStartHour && recordMinute > onTimeThreshold)) {
                        arrivals.late++;
                    } else {
                        arrivals.onTime++;
                    }
                }
            });

            const arrivalsCanvas = document.getElementById('arrivalsChart');
            if (arrivalsCanvas) {
                chartInstances.arrivals = new Chart(arrivalsCanvas.getContext('2d'), {
                    type: 'pie',
                    data: { labels: ['En Horario', 'Tarde'], datasets: [{ data: [arrivals.onTime, arrivals.late], backgroundColor: ['#28a745', '#dc3545'] }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Puntualidad de Ingresos' } } }
                });
            }

            const employeesByShift = users.reduce((acc, user) => {
                if (user.turno) acc[user.turno] = (acc[user.turno] || 0) + 1;
                return acc;
            }, {});

            const shiftCanvas = document.getElementById('shiftChart');
            if (shiftCanvas) {
                chartInstances.shift = new Chart(shiftCanvas.getContext('2d'), {
                    type: 'bar',
                    data: { labels: Object.keys(employeesByShift), datasets: [{ label: 'Nº de Empleados', data: Object.values(employeesByShift), backgroundColor: '#36a2eb' }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Distribución por Turno' } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                });
            }

            const employeesByRole = users.reduce((acc, user) => {
                const role = user.rol || 'No asignado';
                acc[role] = (acc[role] || 0) + 1;
                return acc;
            }, {});

            const roleCanvas = document.getElementById('roleChart');
            if (roleCanvas) {
                chartInstances.role = new Chart(roleCanvas.getContext('2d'), {
                    type: 'bar',
                    data: { labels: Object.keys(employeesByRole), datasets: [{ label: 'Nº de Empleados', data: Object.values(employeesByRole), backgroundColor: '#ffce56' }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Distribución por Rol' } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                });
            }

        } else if (stage === 'Indicadores') {
            indicatorsView.style.display = 'block';
            
            try {
                const [recepcionData, procesamientoData, despachoData] = await Promise.all([
                    fetchRecepcionData(),
                    fetchProcesamientoData(),
                    fetchDespachoData()
                ]);

                const allData = { Recepcion: recepcionData, Procesamiento: procesamientoData, Despacho: despachoData };
                const oeeResults = calculateOEE(allData.Procesamiento);
                const { insights, alerts } = generateInsights(allData, oeeResults);

                if (insights.length > 0) {
                    insightsList.innerHTML = insights.map(insight => 
                        `<div class="employee-card" style="border-left-color: ${
                            insight.level === 'alert' ? '#e74c3c' : 
                            insight.level === 'warning' ? '#f39c12' : '#27ae60'
                        }"><p>${insight.text}</p></div>`
                    ).join('');
                    insightsContainer.style.display = 'block';
                }

                const lastIndex = oeeResults.labels.length - 1;
                
                chartInstances.availability = createDoughnutChart('availabilityChart', 'Disponibilidad', oeeResults.datasets.availability[lastIndex] || 0);
                chartInstances.performance = createDoughnutChart('performanceChart', 'Rendimiento', oeeResults.datasets.performance[lastIndex] || 0);
                chartInstances.quality = createDoughnutChart('qualityChart', 'Calidad', oeeResults.datasets.quality[lastIndex] || 0);

                // Renderizar KPIs adicionales
                const rejectionRate = calculateRejectionRate(allData.Recepcion);
                chartInstances.rejectionRate = createDoughnutChart('rejectionRateChart', 'Rechazo', rejectionRate, true);
                setChartAlertState('rejectionRateChartCard', alerts.rejectionRate);

                const yieldRate = calculateYield(allData.Procesamiento);
                chartInstances.yieldRate = createDoughnutChart('yieldChart', 'Rendimiento', yieldRate);
                
                const docCompliance = calculateDocumentationCompliance(allData.Despacho);
                chartInstances.docCompliance = createDoughnutChart('documentationComplianceChart', 'Cumplimiento', docCompliance);

                const oeeTrendCanvas = document.getElementById('oeeTrendChart');
                if (oeeTrendCanvas) {
                    chartInstances.oeeTrend = new Chart(oeeTrendCanvas.getContext('2d'), {
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
                            responsive: true, maintainAspectRatio: false, 
                            plugins: { title: { display: false } }, 
                            scales: { y: { beginAtZero: true, max: 1, ticks: { callback: v => (v * 100).toFixed(0) + '%' } } } 
                        }
                    });
                }

            } catch (error) {
                console.error('Error cargando datos para indicadores:', error);
                throw new Error('Error al cargar los datos de indicadores');
            }

        } else {
            const stageConfig = {
                'Recepcion': { label: 'Recepción', fetcher: fetchRecepcionData, renderer: renderRecepcionCharts, chartContainerId: 'recepcion-charts' },
                'Almacenamiento': { label: 'Almacenamiento', fetcher: fetchAlmacenamientoData, renderer: renderAlmacenamientoCharts, chartContainerId: 'almacenamiento-charts' },
                'Procesamiento': { label: 'Procesamiento', fetcher: fetchProcesamientoData, renderer: renderProcesamientoCharts, chartContainerId: 'procesamiento-charts' },
                'Conservacion': { label: 'Conservación', fetcher: fetchConservacionData, renderer: renderConservacionCharts, chartContainerId: 'conservacion-charts' },
                'ServicioDespacho': { label: 'Despacho', fetcher: fetchDespachoData, renderer: renderDespachoCharts, chartContainerId: 'despacho-charts' }
            };

            const config = stageConfig[stage];
            if (!config) throw new Error(`Configuración no encontrada para la etapa "${stage}"`);

            stagesView.style.display = 'block';
            document.querySelectorAll('.stage-charts-grid').forEach(grid => grid.classList.remove('active'));
            const chartContainer = document.getElementById(config.chartContainerId);
            if (chartContainer) chartContainer.classList.add('active');

            try {
                const stageData = await config.fetcher();
                if (!stageData || stageData.length === 0) throw new Error(`No hay datos disponibles para "${config.label}"`);
                config.renderer(stageData);
            } catch (error) {
                console.error(`Error cargando datos para ${stage}:`, error);
                throw new Error(`Error al cargar los datos de ${config.label}`);
            }
        }
    } catch (err) {
        console.error(`Error en renderStage para ${stage}:`, err);
        indicatorsView.style.display = 'none';
        stagesView.style.display = 'none';
        accessChartsView.style.display = 'none';
        fallback.textContent = `Error: ${err.message}`;
        fallback.style.display = 'block';
    }
}

// --- Función de Inicialización Exportada ---
export function initializeStatistics(allowedZones) {
    userAllowedZones = allowedZones;
    const stageButtons = document.querySelectorAll('.stage-btn');

    // Asegurar que todos los botones sean visibles
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

    // Activar el primer botón visible por defecto
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

    // Event listeners para los umbrales
    const rejectionThreshold = document.getElementById('rejection-threshold');
    const wasteThreshold = document.getElementById('waste-threshold');
    
    if (rejectionThreshold) {
        rejectionThreshold.addEventListener('change', () => {
            if (document.querySelector('.stage-btn.active')?.dataset.stage === 'Indicadores') {
                renderStage('Indicadores');
            }
        });
    }
    
    if (wasteThreshold) {
        wasteThreshold.addEventListener('change', () => {
            if (document.querySelector('.stage-btn.active')?.dataset.stage === 'Indicadores') {
                renderStage('Indicadores');
            }
        });
    }
}