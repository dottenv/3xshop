// --- System Update Checker ---
import { getCsrfToken } from './modules/core.js';

let updateCheckInterval = null;
let updateNotificationShown = false;

async function checkForUpdates(showNotification = true) {
    try {
        const response = await fetch('/api/updates/check');
        if (!response.ok) return;
        const data = await response.json();

        if (data.available && showNotification && !updateNotificationShown) {
            updateNotificationShown = true;
            showUpdateNotification(data);
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

function showUpdateNotification(data) {
    const message = `
        <div class="update-notification">
            <h5 class="mb-2">Доступно обновление!</h5>
            <p class="mb-2">Текущая версия: <strong>${data.current_version || 'неизвестно'}</strong></p>
            <p class="mb-2">Новая версия: <strong>${data.latest_version || 'неизвестно'}</strong></p>
            <p class="mb-3">Отстаёте на <strong>${data.commits_behind}</strong> коммит(ов)</p>
            ${data.changelog && data.changelog.length > 0 ? `
                <div class="mb-3">
                    <h6 class="mb-2">Последние изменения:</h6>
                    <ul class="mb-0" style="max-height: 150px; overflow-y: auto;">
                        ${data.changelog.map(commit => `
                            <li class="small mb-1">
                                <code>${commit.hash}</code> - ${commit.message}
                                <br><small class="text-muted">${commit.author}, ${commit.date}</small>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-primary btn-sm" onclick="performUpdate()">
                    Обновить сейчас
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick="dismissUpdateNotification()">
                    Позже
                </button>
            </div>
        </div>
    `;

    const container = document.getElementById('toast-container');
    if (container) {
        const el = document.createElement('div');
        el.className = 'toast fade align-items-center text-bg-warning';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');
        el.setAttribute('aria-atomic', 'true');
        el.setAttribute('data-bs-autohide', 'false');
        el.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        container.appendChild(el);
        new bootstrap.Toast(el).show();
    }
}

async function performUpdate() {
    if (!confirm('Вы уверены, что хотите обновить систему? Это может занять несколько минут.')) {
        return;
    }

    try {
        const response = await fetch('/api/updates/perform', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });

        const data = await response.json();

        if (data.success) {
            window.showToast('success', 'Обновление успешно выполнено! Перезагрузите страницу.', 5000);
            setTimeout(() => location.reload(), 3000);
        } else {
            window.showToast('danger', `Ошибка обновления: ${data.error || 'Неизвестная ошибка'}`, 5000);
        }
    } catch (error) {
        window.showToast('danger', `Ошибка обновления: ${error.message}`, 5000);
    }
}

function dismissUpdateNotification() {
    updateNotificationShown = true;
    // Закрываем все toast уведомления об обновлениях
    document.querySelectorAll('.toast .update-notification').forEach(toast => {
        const toastInstance = bootstrap.Toast.getInstance(toast.closest('.toast'));
        if (toastInstance) {
            toastInstance.hide();
        }
    });
}

// Запускаем проверку обновлений каждые 5 минут
document.addEventListener('DOMContentLoaded', function() {
    if (updateCheckInterval === null) {
        checkForUpdates(true);
        updateCheckInterval = setInterval(() => checkForUpdates(true), 5 * 60 * 1000);
    }
});
