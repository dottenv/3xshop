// --- System Update Checker (Backend Only) ---
// Этот модуль содержит только логику для будущего использования
// UI часть удалена по требованию пользователя

// Функция для проверки обновлений (будет использоваться в будущем)
export async function checkUpdates() {
    try {
        const response = await fetch('/api/updates/check');
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error checking for updates:', error);
        return null;
    }
}

// Функция для выполнения обновления (будет использоваться в будущем)
export async function performUpdate() {
    try {
        const response = await fetch('/api/updates/perform', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error performing update:', error);
        return null;
    }
}
