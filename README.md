# 🏭 Sistema de Control de Acceso - PyME Alimenticia

**Proyecto Profesional 1 (PP1) / Laboratorio de Construcción de Software (LCS)**

Sistema web de control de acceso mediante reconocimiento facial diseñado específicamente para pequeñas y medianas empresas del sector alimenticio, enfocado en el control de personal en áreas de producción, almacenamiento y despacho.

## 🎯 Contexto Académico

Este proyecto forma parte del **Proyecto Profesional 1 (PP1)** y **Laboratorio de Construcción de Software (LCS)**, desarrollado como solución tecnológica para una PyME del sector alimenticio que requiere:

### 🎯 Objetivos del Proyecto

- Control de acceso automatizado para diferentes áreas de trabajo
- Trazabilidad de personal en zonas críticas de producción
- Gestión de niveles de acceso según roles (Empleado/Supervisor)
- Historial completo de ingresos y egresos
- Dashboard administrativo para supervisión

## 🌟 Características Principales

### 🔐 Control de Acceso Inteligente
- **Reconocimiento facial** con Face-API.js y TensorFlow.js
- **Doble modalidad**: Facial automático + Manual de respaldo
- **Niveles de acceso** diferenciados (Empleado nivel 1, Supervisor nivel 3)
- **Validación de estado** - previene registros duplicados

### 📊 Gestión Administrativa
- **Panel de supervisor** con estadísticas en tiempo real
- **Historial completo** de accesos con filtros por fecha
- **Contadores dinámicos** de personal dentro/fuera
- **Gestión de empleados** con registro facial

### 📈 Estadísticas Operativas
- **Indicadores OEE** (Overall Equipment Effectiveness) 
- **Análisis por etapas** del proceso productivo:
  - Recepción de materias primas
  - Almacenamiento
  - Procesamiento
  - Conservación
  - Servicio y Despacho
- **Insights automáticos** con alertas de producción

## 🛠️ Stack Tecnológico

### Frontend
- **HTML5** - Estructura semántica moderna
- **CSS3** - Diseño responsive con gradientes corporativos
- **JavaScript ES6+** - Lógica de aplicación modular

### Reconocimiento facial
- **Face-API.js v0.22.2** - Reconocimiento facial en tiempo real
- **TensorFlow.js v2.0.0** - Motor de machine learning
- **Modelos pre-entrenados**: 
  - Tiny Face Detector (detección facial)
  - Face Landmark (puntos de referencia)
  - Face Recognition (reconocimiento de características)

### Backend y Base de Datos
- **Supabase** - Backend as a Service
- **PostgreSQL** - Base de datos relacional
- **Row Level Security (RLS)** - Seguridad a nivel de fila
- **Edge Functions** - Funciones serverless

### Visualización de Datos
- **Chart.js v4.4.0** - Gráficos estadísticos interactivos
- **Papa Parse** - Procesamiento de CSV para datos estadísticos

## 🏗️ Arquitectura del Sistema

### Estructura de Base de Datos
```sql
-- Tabla de usuarios/empleados
users (
  id: UUID PRIMARY KEY,
  codigo_empleado: TEXT UNIQUE,
  nombre: TEXT,
  apellido: TEXT,
  dni: TEXT,
  nivel_acceso: INTEGER, -- 1: Empleado, 3: Supervisor
  descriptor: JSONB,     -- Datos faciales encriptados
  foto: TEXT,            -- URL de imagen
  created_at: TIMESTAMP
)

-- Tabla de registros de acceso
access (
  id: UUID PRIMARY KEY,
  codigo_empleado: TEXT,
  tipo: TEXT,            -- 'ingreso' | 'egreso'
  fecha_hora: TIMESTAMP,
  created_at: TIMESTAMP
)
```

### Flujo de Autenticación
1. **Captura facial** con detección de landmarks
2. **Extracción de descriptor** matemático único
3. **Comparación** con base de datos encriptada
4. **Validación de estado** actual del empleado
5. **Registro** del acceso con timestamp

## 📱 Funcionalidades por Rol

### 👷 Empleados (Nivel 1)
- Registro de ingreso/egreso facial
- Fallback manual con código + DNI
- Confirmación visual del estado
- Acceso básico al sistema

### 👨‍💼 Supervisores (Nivel 3)
- Todas las funciones de empleado
- **Panel administrativo completo**:
  - Registro de nuevos empleados
  - Gestión de usuarios existentes
  - Historial de accesos detallado
  - Estadísticas operativas avanzadas
- **Análisis de producción**:
  - Métricas OEE por proceso
  - Alertas de calidad y desperdicio
  - Seguimiento de materias primas

## 📊 Sistema de Estadísticas Avanzadas

### Indicadores Clave de Rendimiento (KPIs)
- **OEE (Overall Equipment Effectiveness)**
  - Disponibilidad de equipos
  - Rendimiento de producción
  - Índice de calidad

### Análisis por Etapas Productivas
1. **Recepción**: Control de materias primas y proveedores
2. **Almacenamiento**: Gestión de inventario por tipo
3. **Procesamiento**: Producción y control de desperdicio
4. **Conservación**: Envasado y conservación
5. **Despacho**: Distribución de productos terminados

### Alertas Inteligentes
- **Críticas** (Rojas): Alto rechazo de materias primas
- **Advertencias** (Amarillas): Desperdicio elevado por producto
- **Exitosas** (Verdes): Métricas dentro de rangos óptimos

## 🔒 Seguridad y Privacidad

### Protección de Datos Biométricos
- **Sin almacenamiento de imágenes** - Solo descriptores matemáticos
- **Encriptación** de datos faciales en base de datos
- **Procesamiento local** - IA ejecuta en el navegador
- **Cumplimiento GDPR** - Datos mínimos necesarios

### Seguridad de Acceso
- **Row Level Security (RLS)** en Supabase
- **Tokens JWT** para autenticación
- **Validación en tiempo real** del estado de usuario
- **Prevención de registros duplicados**

## 🚀 Instalación y Configuración

### Prerrequisitos
- Navegador moderno (Chrome 60+, Firefox 55+, Safari 12+, Edge 79+)
- Cámara web o dispositivo con cámara frontal
- Conexión a internet estable

## 📚 Guía de Uso

### Registro de Nuevo Empleado
1. Acceder al panel de supervisor
2. Seleccionar "Gestión de Empleados" > "Registrar Nuevo Empleado"
3. Completar datos: código, nombre, apellido, DNI, rol
4. Capturar rostro con la cámara
5. Confirmar registro

### Control de Acceso Diario
1. **Automático**: Mirar a la cámara - reconocimiento instantáneo
2. **Manual**: Ingresar código + DNI como respaldo
3. **Confirmación**: Sistema muestra estado actualizado

### Consulta de Estadísticas
1. Acceder al panel administrativo
2. Seleccionar "Estadísticas"
3. Elegir etapa del proceso productivo
4. Analizar métricas y alertas generadas

## 🧪 Casos de Prueba

### Pruebas de Reconocimiento Facial
- Detección correcta en condiciones de iluminación óptima
- Funcionamiento con diferentes ángulos faciales
- Prevención de reconocimiento múltiple
- Fallback manual cuando el reconocimiento falla

### Pruebas de Lógica de Negocio
- Prevención de ingresos duplicados
- Validación de secuencia ingreso-egreso
- Gestión correcta de niveles de acceso
- Integridad de datos en registros simultáneos

### Pruebas de Rendimiento
- Carga de modelos Face-API en diferentes navegadores
- Procesamiento en tiempo real con múltiples usuarios
- Sincronización con base de datos remota

## 📈 Métricas de Evaluación

### Precisión del Sistema
- **Tasa de reconocimiento facial**: >95% en condiciones normales
- **Tiempo de respuesta**: <6 segundos para autenticación
- **Falsos positivos**: <1% con threshold de 0.6

### Usabilidad
- **Tiempo de entrenamiento**: <5 minutos por usuario
- **Adopción de empleados**: Interfaz intuitiva
- **Disponibilidad del sistema**: 24/7 con fallback manual

## 🔧 Mantenimiento y Soporte

### Logs y Monitoreo
```javascript
// Logs disponibles en consola del navegador
console.log('fetchUsers -> registros obtenidos:', data.length);
console.log('grantAccess - latest records for', user.codigo_empleado);
```

### Solución de Problemas Comunes
- **Cámara no funciona**: Verificar permisos del navegador
- **Reconocimiento impreciso**: Mejorar iluminación
- **Error de base de datos**: Verificar configuración RLS
- **Modelos no cargan**: Confirmar estructura de carpetas

## 🎓 Valor Académico del Proyecto

### Competencias Desarrolladas
- **Integración de tecnologías**: Frontend + IA + Backend
- **Gestión de datos biométricos**: Seguridad y privacidad
- **Análisis de requerimientos**: Solución para PyME real
- **Testing y validación**: Casos de uso empresarial

### Tecnologías de Vanguardia
- Machine Learning en el navegador
- Reconocimiento facial en tiempo real
- Progressive Web App (PWA)
- Backend serverless moderno

## 📄 Licencia y Créditos

**Proyecto Académico** - Proyecto Profesional 1 (PP1) / Laboratorio de Construcción de Software (LCS)

**Tecnologías utilizadas**:
- Face-API.js por Vladimir Mandic
- TensorFlow.js por Google
- Supabase por Supabase Inc.
- Chart.js por Chart.js contributors

---

**Desarrollado para el sector alimenticio** 🥘 **con tecnología de reconocimiento facial** 🔍 **y análisis de datos avanzado** 📊
