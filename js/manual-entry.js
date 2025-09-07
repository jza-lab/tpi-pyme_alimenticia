import { registerAccess } from './api.js';
import { initState, getUsers } from './state.js';

document.addEventListener('DOMContentLoaded', async () => {
    const legajoInput = document.getElementById('legajo');
    const nameInput = document.getElementById('name');
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    const btnSubmit = document.querySelector('.btn-submit');
    const fechaHoraInput = document.getElementById('fecha-hora');
    const typeError = document.getElementById('type-error');
    const legajoError = legajoInput.nextElementSibling;
    const nameError = nameInput.nextElementSibling;

    let selectedType = null;
    let users = [];

    // --- Inicialización ---
    try {
        await initState();
        users = getUsers();
    } catch (error) {
        console.error('Error al inicializar el estado:', error);
        alert('No se pudo cargar la lista de empleados. Por favor, recargue la página.');
    }

    // --- Lógica de Autocompletado ---
    legajoInput.addEventListener('blur', () => {
        const legajo = legajoInput.value.trim();
        if (!legajo) {
            nameInput.value = '';
            validateForm();
            return;
        }

        const user = users.find(u => u.codigo_empleado === legajo);
        if (user) {
            nameInput.value = `${user.nombre} ${user.apellido || ''}`;
            nameError.classList.remove('show');
        } else {
            nameInput.value = 'Empleado no encontrado';
            nameError.classList.add('show');
        }
        validateForm();
    });
    
    // --- Lógica del Formulario ---
    function validateForm() {
        const isLegajoValid = legajoInput.value.trim() !== '';
        const isNameValid = nameInput.value.trim() !== '' && nameInput.value !== 'Empleado no encontrado';
        const isTypeSelected = selectedType !== null;
        const isDateValid = fechaHoraInput.value !== '';

        if (isLegajoValid && isNameValid && isTypeSelected && isDateValid) {
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
        
        const legajo = legajoInput.value.trim();
        const fechaHora = fechaHoraInput.value;

        // Re-validar antes de enviar
        if (!legajo || nameInput.value === 'Empleado no encontrado' || !selectedType || !fechaHora) {
            alert('Por favor, corrija los errores antes de enviar.');
            return;
        }

        try {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = 'Registrando...';

            const isoDate = new Date(fechaHora).toISOString();
            await registerAccess(legajo, selectedType, isoDate);
            
            alert(`Registro de ${selectedType.toUpperCase()} para ${nameInput.value} (Legajo ${legajo}) guardado exitosamente.`);
            
            // Resetear formulario
            legajoInput.value = '';
            nameInput.value = '';
            fechaHoraInput.value = '';
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            selectedType = null;
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
    validateForm();
});
