export function initDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown');

    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        if (!toggle) return;

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');

            // Close other dropdowns
            dropdowns.forEach(other => {
                if (other !== dropdown) other.classList.remove('active');
            });
        });
    });

    document.addEventListener('click', () => {
        dropdowns.forEach(dropdown => dropdown.classList.remove('active'));
    });
}
