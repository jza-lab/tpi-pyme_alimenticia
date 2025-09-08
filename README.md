# 🏭 Sistema de Control de Acceso para PyMEs del Sector Alimenticio

**Proyecto Profesional | Valor Académico y Aplicación Empresarial**

Este sistema de control de acceso mediante reconocimiento facial es una solución tecnológica robusta, desarrollada en un marco académico, y diseñada para satisfacer las necesidades operativas y de seguridad de las Pequeñas y Medianas Empresas (PyMEs) del sector alimenticio.

## 🌟 Beneficios para su Empresa

La implementación de este sistema en su empresa se traduce en ventajas competitivas y mejoras operativas tangibles:

-   **Optimización de la Seguridad:** Reemplace los sistemas de tarjetas o llaves por una identificación biométrica que previene el acceso de personal no autorizado y reduce el riesgo de suplantación de identidad.
-   **Aumento de la Productividad:** Automatice el registro de ingresos y egresos, eliminando procesos manuales y permitiendo que su personal se enfoque en tareas de mayor valor.
-   **Trazabilidad y Cumplimiento:** Mantenga un registro digital y auditable de quién accede a cada área y cuándo, facilitando el cumplimiento de normativas de seguridad alimentaria y control de calidad.
-   **Decisiones Basadas en Datos:** Acceda a un panel de control con estadísticas clave sobre la ocupación de áreas y flujos de personal, permitiendo una mejor planificación de los recursos.
-   **Reducción de Costos:** Disminuya los costos asociados a la pérdida, reposición y gestión de tarjetas o llaves de acceso.

## ✨ Funcionalidades Principales

-   **Reconocimiento Facial Preciso:** Utiliza tecnología de IA para una identificación rápida y confiable.
-   **Modalidad Dual:** Ofrece un método de acceso manual (legajo + DNI) como respaldo, garantizando la continuidad operativa.
-   **Gestión por Roles:** Asigne diferentes niveles de acceso (Empleado, Supervisor) para proteger áreas restringidas.
-   **Panel de Supervisión Centralizado:**
    -   Administración de empleados (altas, bajas y modificaciones).
    -   Visualización del historial de accesos en tiempo real.
    -   Estadísticas de personal y ocupación de áreas.
-   **Seguridad Reforzada:** El acceso al menú de supervisor requiere una doble verificación (autenticación facial/manual + legajo de operario).

## 🚀 Guía de Uso Rápido

El sistema está diseñado para ser intuitivo y fácil de usar.

### Control de Acceso Diario

1.  **Mirar a la Cámara:** El empleado se posiciona frente al dispositivo. El sistema lo reconoce y registra su ingreso o egreso automáticamente.
2.  **Acceso Manual (si es necesario):** Si el reconocimiento facial falla, el empleado puede ingresar su legajo de operario y DNI para registrarse.
3.  **Confirmación Instantánea:** El sistema muestra un mensaje de bienvenida y confirma que el registro fue exitoso.

### Tareas del Supervisor

1.  **Acceder al Menú de Supervisor:**
    -   Tras un inicio de sesión exitoso, el supervisor verá el botón "Menú Supervisor".
    -   Al hacer clic, el sistema solicitará un **legajo de operario** como medida de seguridad adicional.
2.  **Gestionar Empleados:**
    -   Navegue a "Gestión de Empleados" para registrar a un nuevo miembro del equipo.
    -   Complete el formulario con sus datos y capture su rostro con la cámara.
3.  **Consultar Registros:**
    -   Vaya a "Historial de Accesos" para ver un listado completo de todos los ingresos y egresos, con filtros por fecha.

## 🛠️ Tecnología y Arquitectura

Este proyecto integra tecnologías de vanguardia para ofrecer una solución moderna y eficiente, combinando Machine Learning en el navegador con un backend serverless.

-   **Frontend:** HTML5, CSS3, JavaScript (ES6+)
-   **Reconocimiento Facial:** `face-api.js` (basado en TensorFlow.js)
-   **Backend y Base de Datos:** Supabase (PostgreSQL)
-   **Visualización de Datos:** Chart.js

## 🔒 Seguridad y Privacidad

La protección de los datos de su personal es nuestra máxima prioridad.

-   **Datos Biométricos Protegidos:** El sistema no almacena imágenes faciales. En su lugar, genera y almacena un descriptor matemático único para cada persona.
-   **Procesamiento en el Dispositivo:** El reconocimiento se ejecuta localmente en el navegador, lo que significa que los datos biométricos no viajan por la red.
-   **Comunicaciones Seguras:** Toda la comunicación con la base de datos está encriptada.

## 🎓 Valor Académico del Proyecto

Este sistema es el resultado de un **Proyecto Profesional** que demuestra la aplicación de competencias en desarrollo de software para resolver problemas empresariales del mundo real. Las habilidades clave desarrolladas incluyen:

-   Integración de Inteligencia Artificial en aplicaciones web.
-   Diseño de arquitecturas seguras y escalables.
-   Análisis de requerimientos y desarrollo de soluciones a medida para PyMEs.

---
*Desarrollado con un enfoque en la innovación y la seguridad para el sector empresarial.*