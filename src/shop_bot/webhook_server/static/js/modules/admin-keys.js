// Admin Keys Module
// Управление ключами VPN: создание, продление, комментарии

import { getCsrfToken, showToast, refreshContainerById } from './core.js';

export function initializeAdminKeysPage() {
    // Полный список пользователей для автокомплита
    const usersDataEl = document.getElementById('users-data');
    const USERS = usersDataEl ? JSON.parse(usersDataEl.textContent || '[]') : [];
    const USER_MAP = {};
    (USERS || []).forEach(u => {
        if (u && u.username) {
            USER_MAP['@' + String(u.username).toLowerCase()] = u.telegram_id;
        }
    });

    // Элементы формы
    const form = document.getElementById('create-key-form');
    const submitBtn = document.getElementById('btn-submit-create');
    const keyTypeInput = document.getElementById('key_type');
    const btnTypePersonal = document.getElementById('btn-type-personal');
    const btnTypeGift = document.getElementById('btn-type-gift');
    const hostSel = document.getElementById('host_name');
    const planSel = document.getElementById('plan_select');
    const priceEl = document.getElementById('plan_price');
    const expiryInput = document.getElementById('expiry_date');
    const emailInput = document.getElementById('key_email');
    const userInput = document.getElementById('user_id');
    const userGroup = document.getElementById('group_user');

    if (!form || !submitBtn) return;

    // Блокируем Enter в форме
    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
    });

    // localStorage сохранение состояния
    const fields = ['user_id', 'host_name', 'key_email', 'plan_select', 'expiry_date', 'key_type', 'comment'];
    function saveState() {
        const state = {};
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) state[id] = el.value;
        });
        try { localStorage.setItem('admin_keys_form', JSON.stringify(state)); } catch(_) {}
    }
    function restoreState() {
        try {
            const raw = localStorage.getItem('admin_keys_form');
            if (!raw) return;
            const st = JSON.parse(raw);
            fields.forEach(id => {
                const el = document.getElementById(id);
                if (el && st[id] != null) el.value = st[id];
            });
        } catch(_) {}
    }
    restoreState();
    form.addEventListener('input', saveState);
    form.addEventListener('change', saveState);

    // Префил из query ?user_id=
    try {
        const params = new URLSearchParams(location.search);
        const uid = params.get('user_id');
        if (uid && userInput) userInput.value = uid;
    } catch(_) {}

    // Flatpickr для даты
    if (expiryInput && window.flatpickr) {
        const localeRu = (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ru) ? window.flatpickr.l10ns.ru : 'ru';
        flatpickr(expiryInput, {
            enableTime: true,
            time_24hr: true,
            dateFormat: 'Y-m-d H:i',
            minuteIncrement: 5,
            locale: localeRu
        });
    }

    // Установка срока действия
    function setExpiryDays(days) {
        if (!expiryInput) return;
        const d = new Date();
        d.setDate(d.getDate() + Number(days || 0));
        const pad = n => String(n).padStart(2, '0');
        const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        expiryInput.value = val;
        if (window.flatpickr && expiryInput._flatpickr) {
            expiryInput._flatpickr.setDate(val, true, 'Y-m-d H:i');
        }
    }

    // Обработчики пресетов срока
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const add = Number(btn.getAttribute('data-preset')) || 0;
            if (add > 0) setExpiryDays(add);
        });
    });

    // Загрузка тарифов для хоста
    async function loadPlans() {
        if (!hostSel || !planSel) return;
        const host = hostSel.value;
        if (!host) {
            planSel.innerHTML = '<option value="">— Не выбран —</option>';
            planSel.disabled = true;
            if (priceEl) priceEl.textContent = '— ₽';
            return;
        }
        planSel.disabled = true;
        planSel.innerHTML = '<option value="">Загрузка...</option>';
        try {
            const url = `/admin/hosts/${encodeURIComponent(host)}/plans`;
            const res = await fetch(url);
            const d = await res.json();
            const items = (d && d.ok && d.items) ? d.items : [];
            const saved = (JSON.parse(localStorage.getItem('admin_keys_form') || '{}') || {}).plan_select;
            planSel.innerHTML = '<option value="">— Не выбран —</option>' +
                items.map(p => `<option value="${p.plan_id}" data-months="${p.months}" data-price="${p.price || 0}">${p.plan_name} (${p.months} мес.) — ${Number(p.price || 0).toFixed(0)} ₽</option>`).join('');
            planSel.disabled = false;
            if (saved) {
                planSel.value = saved;
                const opt = planSel.options[planSel.selectedIndex];
                const price = opt ? Number(opt.getAttribute('data-price') || 0) : 0;
                if (priceEl) priceEl.textContent = saved ? `${price.toFixed(0)} ₽` : '— ₽';
                const months = opt ? Number(opt.getAttribute('data-months') || 0) : 0;
                if (months > 0) setExpiryDays(months * 30);
            } else if (priceEl) {
                priceEl.textContent = '— ₽';
            }
            planSel.dispatchEvent(new Event('change', { bubbles: true }));
        } catch(_) {
            planSel.innerHTML = '<option value="">— Не выбран —</option>';
            planSel.disabled = false;
            if (priceEl) priceEl.textContent = '— ₽';
        }
    }

    if (hostSel) {
        hostSel.addEventListener('change', () => {
            loadPlans();
            saveState();
        });
        if (hostSel.value) loadPlans();
    }

    if (planSel) {
        planSel.addEventListener('change', () => {
            const opt = planSel.options[planSel.selectedIndex];
            const months = opt ? Number(opt.getAttribute('data-months') || 0) : 0;
            if (months > 0) setExpiryDays(months * 30);
            const price = opt ? Number(opt.getAttribute('data-price') || 0) : 0;
            if (priceEl) priceEl.textContent = price > 0 ? `${price.toFixed(0)} ₽` : '— ₽';
            saveState();
        });
    }

    // Автокомплит пользователей
    function initUserSuggest() {
        if (!userInput) return;
        let menu = document.getElementById('user-suggest-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'user-suggest-menu';
            menu.className = 'soft-select-menu';
            document.body.appendChild(menu);
        }

        function place() {
            const r = userInput.getBoundingClientRect();
            const parentRect = userInput.closest('#group_user').getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.left = `${Math.round(r.left)}px`;
            menu.style.top = `${Math.round(r.bottom + 2)}px`;
            menu.style.width = `${Math.round(r.width)}px`;
            menu.style.zIndex = '1065';
        }
        function close() { menu.style.display = 'none'; }
        function open() { place(); menu.style.display = 'block'; }

        function render(list) {
            menu.innerHTML = '';
            list.slice(0, 8).forEach(u => {
                const item = document.createElement('div');
                item.className = 'soft-select-item';
                const username = u.username ? '@' + String(u.username) : '—';
                item.innerHTML = `<div style="font-weight:600">${u.telegram_id}</div><div style="opacity:.75">${username}</div>`;
                item.onclick = () => {
                    userInput.value = String(u.telegram_id);
                    close();
                    normalizeUserId();
                    maybeGenEmail();
                };
                menu.appendChild(item);
            });
            if (list.length === 0) {
                const none = document.createElement('div');
                none.className = 'soft-select-item';
                none.style.opacity = '.7';
                none.textContent = 'Ничего не найдено';
                menu.appendChild(none);
            }
        }

        function applyFilter() {
            const q = String(userInput.value || '').trim().toLowerCase();
            if (!q) { close(); return; }
            const arr = (USERS || []).filter(u => {
                const idm = String(u.telegram_id || '').includes(q);
                const unm = (u.username ? ('@' + String(u.username).toLowerCase()) : '').includes(q);
                return idm || unm;
            });
            render(arr);
            open();
        }

        userInput.addEventListener('focus', applyFilter);
        userInput.addEventListener('input', applyFilter);
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place, true);
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== userInput) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
    }
    initUserSuggest();

    async function normalizeUserId() {
        if (!userInput) return;
        const raw = String(userInput.value || '').trim();
        if (!raw) return;
        if (!/^[0-9]+$/.test(raw)) {
            const key = raw.startsWith('@') ? raw.toLowerCase() : ('@' + raw.toLowerCase());
            if (USER_MAP[key]) {
                userInput.value = String(USER_MAP[key]);
                try {
                    localStorage.setItem('admin_keys_form', JSON.stringify({
                        ...JSON.parse(localStorage.getItem('admin_keys_form') || '{}'),
                        user_id: userInput.value
                    }));
                } catch(_) {}
            }
        }
    }

    async function maybeGenEmail() {
        if (!emailInput) return;
        const type = keyTypeInput?.value || 'personal';
        if (type === 'gift') {
            try {
                const res = await fetch('/admin/keys/generate-gift-email');
                const data = await res.json();
                if (data && data.ok && data.email) emailInput.value = data.email;
            } catch(_) {}
            return;
        }
        const userId = userInput?.value && String(userInput.value).trim();
        if (!userId) return;
        try {
            const res = await fetch(`/admin/keys/generate-email?user_id=${encodeURIComponent(userId)}`);
            const data = await res.json();
            if (data && data.ok && data.email) emailInput.value = data.email;
        } catch(_) {}
    }

    if (userInput) {
        userInput.addEventListener('blur', () => { normalizeUserId(); maybeGenEmail(); });
        userInput.addEventListener('change', () => { normalizeUserId(); maybeGenEmail(); });
        normalizeUserId();
        maybeGenEmail();
    }

    function applyKeyTypeUI() {
        const type = keyTypeInput?.value || 'personal';
        if (type === 'gift') {
            if (userGroup) userGroup.style.display = 'none';
            maybeGenEmail();
        } else {
            if (userGroup) userGroup.style.display = '';
            normalizeUserId();
            maybeGenEmail();
        }
    }

    if (btnTypePersonal) {
        btnTypePersonal.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (keyTypeInput) keyTypeInput.value = 'personal';
                applyKeyTypeUI();
                saveState();
            }
        });
    }
    if (btnTypeGift) {
        btnTypeGift.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (keyTypeInput) keyTypeInput.value = 'gift';
                applyKeyTypeUI();
                saveState();
            }
        });
    }
    applyKeyTypeUI();

    async function doSubmit(e) {
        e.preventDefault();
        await maybeGenEmail();
        submitBtn.disabled = true;
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="ti ti-loader-2 ti-spin me-2"></i>Создаю...';
        try {
            const fd = new FormData(form);
            const res = await fetch(form.action, { method: 'POST', body: fd, credentials: 'same-origin' });
            const data = await res.json().catch(() => ({ ok: false }));
            if (data && data.ok) {
                showToast('success', 'Ключ создан успешно');
                form.reset();
                saveState();
                refreshContainerById('keys-tbody');
            } else {
                showToast('danger', data.error || 'Не удалось создать ключ');
            }
        } catch (err) {
            showToast('danger', 'Ошибка при создании ключа');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
    form.addEventListener('submit', doSubmit);

    const expiryModal = document.getElementById('expiryModal');
    const expiryDeltaInput = document.getElementById('expiryDelta');
    const expirySaveBtn = document.getElementById('expiry-save-btn');

    if (expiryModal && expiryDeltaInput && expirySaveBtn) {
        let currentKeyId = null;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="edit-expiry"]');
            if (!btn) return;
            currentKeyId = btn.getAttribute('data-key-id');
            expiryDeltaInput.value = '';
            const modal = bootstrap.Modal.getInstance(expiryModal) || new bootstrap.Modal(expiryModal);
            modal.show();
        });

        expirySaveBtn.addEventListener('click', async () => {
            const val = String(expiryDeltaInput.value || '').trim();
            if (!currentKeyId || !val) {
                showToast('warning', 'Введите количество дней');
                return;
            }
            const delta = Number(val);
            if (!Number.isFinite(delta) || Math.abs(delta) > 3650) {
                showToast('warning', 'Некорректное значение');
                return;
            }
            expirySaveBtn.disabled = true;
            expirySaveBtn.textContent = 'Сохранение...';
            try {
                const url = `/admin/keys/${encodeURIComponent(currentKeyId)}/adjust-expiry`;
                const fd = new FormData();
                fd.append('csrf_token', getCsrfToken());
                fd.append('delta_days', String(delta));
                const resp = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
                if (resp.ok) {
                    const modal = bootstrap.Modal.getInstance(expiryModal);
                    if (modal) modal.hide();
                    showToast('success', 'Срок обновлен');
                    refreshContainerById('keys-tbody');
                } else {
                    const data = await resp.json().catch(() => null);
                    showToast('danger', data?.error || 'Не удалось обновить срок');
                }
            } catch(_) {
                showToast('danger', 'Ошибка сети');
            } finally {
                expirySaveBtn.disabled = false;
                expirySaveBtn.textContent = 'Сохранить';
            }
        });
    }

    const commentModal = document.getElementById('commentModal');
    const commentInput = document.getElementById('commentInput');
    const commentSaveBtn = document.getElementById('comment-save-btn');

    if (commentModal && commentInput && commentSaveBtn) {
        let currentKeyId = null;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="edit-comment"]');
            if (!btn) return;
            currentKeyId = btn.getAttribute('data-key-id');
            commentInput.value = btn.getAttribute('data-comment') || '';
            const modal = bootstrap.Modal.getInstance(commentModal) || new bootstrap.Modal(commentModal);
            modal.show();
        });

        commentSaveBtn.addEventListener('click', async () => {
            if (!currentKeyId) return;
            commentSaveBtn.disabled = true;
            commentSaveBtn.textContent = 'Сохранение...';
            try {
                const url = `/admin/keys/${encodeURIComponent(currentKeyId)}/comment`;
                const fd = new FormData();
                fd.append('csrf_token', getCsrfToken());
                fd.append('comment', commentInput.value || '');
                const resp = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
                if (resp.ok) {
                    const modal = bootstrap.Modal.getInstance(commentModal);
                    if (modal) modal.hide();
                    showToast('success', 'Комментарий сохранен');
                    refreshContainerById('keys-tbody');
                } else {
                    const data = await resp.json().catch(() => null);
                    showToast('danger', data?.error || 'Не удалось сохранить комментарий');
                }
            } catch(_) {
                showToast('danger', 'Ошибка сети');
            } finally {
                commentSaveBtn.disabled = false;
                commentSaveBtn.textContent = 'Сохранить';
            }
        });
    }
}
