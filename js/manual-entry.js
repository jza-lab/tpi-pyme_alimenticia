import { registerAccess } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- Referencias al DOM ---
    const legajoInput = document.getElementById('legajo');
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    const btnSubmit = document.querySelector('.btn-submit');
    const fechaHoraInput = document.getElementById('fecha-hora');
    const typeError = document.getElementById('type-error');

    // Detalles del empleado
    const employeeDetailsContainer = document.getElementById('employee-details');
    const employeeName = document.getElementById('employee-name');
    const employeeSurname = document.getElementById('employee-surname');
    const employeeDni = document.getElementById('employee-dni');
    const employeeShift = document.getElementById('employee-shift');
    const employeeRole = document.getElementById('employee-role');
    const employeeAccessLevel = document.getElementById('employee-access-level');
    const employeeNotFoundMsg = document.getElementById('employee-not-found');

    // --- Estado ---
    let selectedType = null;
    let users = [];
    let selectedUser = null;

    // --- Función para obtener usuarios directamente desde la API ---
    async function loadUsers() {
        try {
            const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
            const supabase = createClient('https://xtruedkvobfabctfmyys.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0cnVlZGt2b2JmYWJjdGZteXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NzkzOTUsImV4cCI6MjA3MjA1NTM5NX0.ViqW5ii4uOpvO48iG3FD6S4eg085GvXr-xKUC4TLrqo');
            
            const { data, error } = await supabase.from('users').select('*');
            if (error) {
                console.error('Error al obtener usuarios:', error);
                throw error;
            }
            users = data || [];
            console.log('Usuarios cargados:', users.length);
        } catch (error) {
            console.error('Error al cargar usuarios:', error);
            alert('No se pudo cargar la lista de empleados. Por favor, recargue la página.');
        }
    }

    // --- Inicialización ---
    await loadUsers();

    // --- Configurar restricciones de fecha ---
    function setupDateTimeRestrictions() {
        const now = new Date();
        const maxDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        fechaHoraInput.setAttribute('max', maxDateTime);
        
        // Actualizar el máximo cada minuto para mantenerlo actualizado
        setInterval(() => {
            const currentTime = new Date();
            const maxTime = new Date(currentTime.getTime() - currentTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            fechaHoraInput.setAttribute('max', maxTime);
        }, 60000);
    }

    // --- Validar fecha seleccionada ---
    function validateDateTime() {
        const selectedDateTime = new Date(fechaHoraInput.value);
        const now = new Date();
        
        if (selectedDateTime > now) {
            alert('No se pueden cargar registros de fechas futuras. Por favor, seleccione una fecha y hora actual o anterior.');
            fechaHoraInput.value = '';
            return false;
        }
        return true;
    }

    // --- Lógica de Autocompletado ---
    function clearEmployeeDetails() {
        employeeName.textContent = '-';
        employeeSurname.textContent = '-';
        employeeDni.textContent = '-';
        employeeShift.textContent = '-';
        employeeRole.textContent = '-';
        employeeAccessLevel.textContent = '-';
        employeeDetailsContainer.classList.remove('found');
        employeeNotFoundMsg.style.display = 'none';
        
        // Limpiar también el mensaje de error de legajo
        const legajoError = legajoInput.parentElement.querySelector('.error-msg');
        if (legajoError) {
            legajoError.classList.remove('show');
        }
    }

    function searchEmployee(legajo) {
        console.log('Buscando empleado con legajo:', legajo);
        clearEmployeeDetails();
        selectedUser = null;

        if (!legajo || legajo.length === 0) {
            validateForm();
            return;
        }

        const user = users.find(u => u.codigo_empleado === legajo);
        
        if (user) {
            console.log('Usuario encontrado:', user);
            selectedUser = user;
            employeeName.textContent = user.nombre || '-';
            employeeSurname.textContent = user.apellido || '-';
            employeeDni.textContent = user.dni || '-';
            employeeShift.textContent = user.turno || '-';
            employeeRole.textContent = user.rol || '-';
            employeeAccessLevel.textContent = `Nivel ${user.nivel_acceso || '-'}`;
            employeeDetailsContainer.classList.add('found');
        } else if (legajo.length > 0) {
            // Solo mostrar error si hay texto ingresado
            console.log('Usuario no encontrado');
            employeeNotFoundMsg.style.display = 'block';
            const legajoError = legajoInput.parentElement.querySelector('.error-msg');
            if (legajoError) {
                legajoError.classList.add('show');
            }
        }
        validateForm();
    }

    // Buscar empleado en tiempo real mientras el usuario escribe
    legajoInput.addEventListener('input', (e) => {
        const legajo = e.target.value.trim();
        searchEmployee(legajo);
    });

    // También buscar empleado cuando se pierde el foco (por si acaso)
    legajoInput.addEventListener('blur', () => {
        const legajo = legajoInput.value.trim();
        searchEmployee(legajo);
    });

    // --- Lógica del Formulario ---
    function validateForm() {
        const isUserFound = selectedUser !== null;
        const isTypeSelected = selectedType !== null;
        const isDateValid = fechaHoraInput.value !== '';

        console.log('Validando formulario:', { isUserFound, isTypeSelected, isDateValid });

        if (isUserFound && isTypeSelected && isDateValid) {
            btnSubmit.disabled = false;
            const typeText = selectedType === 'ingreso' ? 'Ingreso' : 'Egreso';
            btnSubmit.innerHTML = `<i class='bx bx-check'></i> Registrar ${typeText}`;
            btnSubmit.classList.remove('disabled');
        } else {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class='bx bx-check'></i> Complete todos los campos`;
            btnSubmit.classList.add('disabled');
        }
    }

    // Event listeners para validación
    [legajoInput, fechaHoraInput].forEach(input => {
        input.addEventListener('input', validateForm);
    });

    // Agregar validación de fecha/hora
    fechaHoraInput.addEventListener('change', () => {
        validateDateTime();
        validateForm();
    });

    // Manejar selección de tipo de acceso
    toggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            selectedType = this.getAttribute('data-type');
            typeError.classList.remove('show');
            console.log('Tipo seleccionado:', selectedType);
            validateForm();
        });
    });

    // --- Envío del Formulario ---
    btnSubmit.addEventListener('click', async (e) => {
        e.preventDefault();

        // Re-validar antes de enviar
        if (!selectedUser || !selectedType || !fechaHoraInput.value) {
            alert('Por favor, corrija los errores antes de enviar.');
            return;
        }

        try {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Registrando...';

            const isoDate = new Date(fechaHoraInput.value).toISOString();
            console.log('Registrando acceso:', {
                codigo: selectedUser.codigo_empleado,
                tipo: selectedType,
                fecha: isoDate
            });

            await registerAccess(selectedUser.codigo_empleado, selectedType, isoDate);

            alert(`Registro de ${selectedType.toUpperCase()} para ${selectedUser.nombre} ${selectedUser.apellido} (Legajo ${selectedUser.codigo_empleado}) guardado exitosamente.`);

            // Resetear formulario
            legajoInput.value = '';
            fechaHoraInput.value = '';
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            selectedType = null;
            selectedUser = null;
            clearEmployeeDetails();
            validateForm();

        } catch (error) {
            console.error('Error al registrar acceso manual:', error);
            let errorMessage = 'Ocurrió un error desconocido.';
            
            if (error.context && typeof error.context.json === 'function') {
                try {
                    const jsonError = await error.context.json();
                    errorMessage = jsonError.error || errorMessage;
                } catch (e) {
                    errorMessage = error.message || errorMessage;
                }
            } else {
                errorMessage = error.message || errorMessage;
            }
            
            alert(`Error al guardar el registro: ${errorMessage}`);
        } finally {
            validateForm();
        }
    });

    // --- Navegación ---
    document.querySelector('.btn-volver-menu').addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = "menu.html";
    });

    // Estado inicial
    clearEmployeeDetails();
    setupDateTimeRestrictions();
    validateForm();
});