// UI Components Module
import { showToast } from './core.js';

// Init tooltips helpers
export function initTooltipsWithin(root) {
    if (!window.bootstrap) return;
    const scope = root || document;
    // уничтожаем старые тултипы, если есть data-bs-toggle
    scope.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        try { bootstrap.Tooltip.getInstance(el)?.dispose(); } catch (_) { }
    });
    const targets = scope.querySelectorAll('[data-bs-toggle="tooltip"], .btn[title], a.btn[title]');
    targets.forEach(el => {
        try { new bootstrap.Tooltip(el, { container: 'body' }); } catch (_) { }
    });
}

// Theme toggle: persists selection and updates <html data-bs-theme>
export function initializeThemeToggle() {
    const THEME_KEY = 'ui_theme';
    const root = document.documentElement; // <html>
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    
    // Load saved theme
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    root.setAttribute('data-bs-theme', saved);
    updateUI(saved);
    
    btn.addEventListener('click', () => {
        const current = root.getAttribute('data-bs-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        root.setAttribute('data-bs-theme', next);
        localStorage.setItem(THEME_KEY, next);
        updateUI(next);
    });
    
    function updateUI(theme) {
        const icon = btn.querySelector('i');
        const span = btn.querySelector('span');
        if (icon) icon.className = theme === 'dark' ? 'ti ti-moon' : 'ti ti-sun';
        // if (span) span.textContent = theme === 'dark' ? 'Темная' : 'Светлая';
    }
}

// Password toggles
export function initializePasswordToggles() {
    const togglePasswordButtons = document.querySelectorAll('.toggle-password');
    togglePasswordButtons.forEach(button => {
        // Инициализируем иконку согласно текущему состоянию
        const input = button.previousElementSibling;
        if (!input || input.type !== 'password') return;
        
        updateIcon(button, input.type === 'password');
        
        button.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            updateIcon(button, !isPassword);
        });
    });
    
    function updateIcon(button, isPassword) {
        const icon = button.querySelector('i');
        if (!icon) return;
        icon.className = isPassword ? 'ti ti-eye' : 'ti ti-eye-off';
    }
}

// Settings tabs: show/hide sections by hash and set active nav link
export function initializeSettingsTabs() {
    const nav = document.querySelector('.nav.nav-pills');
    const container = document.querySelector('.settings-container');
    if (!nav || !container) return; // not on settings page
    
    const links = nav.querySelectorAll('a[data-bs-toggle="pill"]');
    const sections = container.querySelectorAll('.settings-section');
    
    // Show section by hash
    function showSection(hash) {
        if (!hash) return;
        const target = links.find(l => l.getAttribute('href') === hash);
        if (!target) return;
        
        // Activate nav link
        links.forEach(l => l.classList.remove('active'));
        target.classList.add('active');
        
        // Show corresponding section
        const sectionId = hash.substring(1);
        sections.forEach(s => {
            s.classList.toggle('d-none', s.id !== sectionId);
        });
    }
    
    // Handle hash change
    window.addEventListener('hashchange', () => showSection(window.location.hash));
    showSection(window.location.hash);
}
