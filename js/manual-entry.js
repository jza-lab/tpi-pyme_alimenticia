import { registerAccess } from './api.js';
import { initState, getUsers } from './state.js';

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

    // --- Inicialización ---
    try {
        await initState();
        users = getUsers();
    } catch (error) {
        console.error('Error al inicializar el estado:', error);
        alert('No se pudo cargar la lista de empleados. Por favor, recargue la página.');
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
    }

    legajoInput.addEventListener('blur', () => {
        const legajo = legajoInput.value.trim();
        clearEmployeeDetails();
        selectedUser = null;

        if (!legajo) {
            validateForm();
            return;
        }

        const user = users.find(u => u.codigo_empleado === legajo);
        if (user) {
            selectedUser = user;
            employeeName.textContent = user.nombre || '-';
            employeeSurname.textContent = user.apellido || '-';
            employeeDni.textContent = user.dni || '-';
            employeeShift.textContent = user.turno || '-';
            employeeRole.textContent = user.rol || '-';
            employeeAccessLevel.textContent = user.nivel_acceso || '-';
            employeeDetailsContainer.classList.add('found');
        } else {
            employeeNotFoundMsg.style.display = 'block';
        }
        validateForm();
    });

    // --- Lógica del Formulario ---
    function validateForm() {
        const isUserFound = selectedUser !== null;
        const isTypeSelected = selectedType !== null;
        const isDateValid = fechaHoraInput.value !== '';

        if (isUserFound && isTypeSelected && isDateValid) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = selectedType === 'ingreso'
                ? `<i class='bx bx-plus'></i> Registrar Ingreso`
                : `<i class='bx bx-minus'></i> Registrar Egreso`;
        } else {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class='bx bx-check'></i> Complete todos los campos`;
        }
    }

    [legajoInput, fechaHoraInput].forEach(input => {
        input.addEventListener('input', validateForm);
    });

    toggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            selectedType = this.getAttribute('data-type');
            typeError.classList.remove('show');
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
            btnSubmit.innerHTML = 'Registrando...';

            const isoDate = new Date(fechaHoraInput.value).toISOString();
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
            const errorMessage = error.context?.json?.().error || error.message || 'Ocurrió un error desconocido.';
            alert(`Error al guardar el registro: ${errorMessage}`);
        } finally {
            validateForm();
        }
    });

    // --- Navegación ---
    document.querySelector('.btn-volver-menu').addEventListener('click', () => {
        window.location.href = "menu.html";
    });

    // Estado inicial
    clearEmployeeDetails();
    validateForm();
});
