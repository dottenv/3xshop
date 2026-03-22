// Dashboard & Charts Module
import { refreshContainerById } from './core.js';

export function initializeDashboardCharts() {
    const combinedChartCanvas = document.getElementById('combinedStatsChart');
    if (!combinedChartCanvas || typeof CHART_DATA === 'undefined') {
        return;
    }

    const ctx = combinedChartCanvas.getContext('2d');

    // Prepare data
    const labels = CHART_DATA.dates || [];
    const usersData = CHART_DATA.users || [];
    const keysData = CHART_DATA.keys || [];

    // Create combined chart
    if (window.Chart) {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Новые пользователи',
                        data: usersData,
                        borderColor: '#206bc4',
                        backgroundColor: 'rgba(32, 107, 196, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'Новые ключи',
                        data: keysData,
                        borderColor: '#2fb344',
                        backgroundColor: 'rgba(47, 179, 68, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxRotation: 0,
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    // Auto-refresh charts every 10 seconds
    setInterval(refreshCharts, 10000);
}

function refreshCharts() {
    const statsContainer = document.getElementById('dash-stats');
    if (statsContainer) {
        refreshContainerById('dash-stats');
    }
}

// Dashboard page specific logic
export function initializeDashboardPage() {
    // Initialize main charts
    initializeDashboardCharts();
    
    // Soft-select helpers
    function buildSoftSelect(selectEl, toggleEl, menuEl, placeholder) {
        if (!selectEl || !toggleEl || !menuEl) return;
        
        menuEl.innerHTML = '';
        const opts = Array.from(selectEl.options || []);
        opts.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'soft-select-item' + (opt.selected ? ' is-active' : '');
            div.dataset.value = opt.value;
            div.innerHTML = `<span style="opacity:.75">${opt.textContent||''}</span> <span class="ms-1 text-warning"><i class="ti ti-bolt"></i></span>`;
            div.addEventListener('click', () => {
                selectEl.value = opt.value;
                menuEl.querySelectorAll('.soft-select-item').forEach(el => el.classList.remove('is-active'));
                div.classList.add('is-active');
                toggleEl.textContent = opt.textContent || placeholder || '';
                toggleEl.closest('.soft-select')?.classList.remove('open');
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            });
            menuEl.appendChild(div);
        });
        
        const selOpt = opts.find(o => o.selected) || opts[0];
        toggleEl.textContent = (selOpt && selOpt.textContent) || placeholder || '';
        const wrap = toggleEl.closest('.soft-select');
        
        function placeMenu() {
            const r = toggleEl.getBoundingClientRect();
            menuEl.style.position = 'fixed';
            menuEl.style.left = `${Math.round(r.left)}px`;
            menuEl.style.top = `${Math.round(r.bottom + 6)}px`;
            menuEl.style.width = `${Math.round(r.width)}px`;
            menuEl.style.zIndex = '1065';
        }
        
        function openMenu() {
            if (menuEl.parentElement !== document.body) document.body.appendChild(menuEl);
            placeMenu();
            wrap.classList.add('open');
            menuEl.style.display = 'block';
            window.addEventListener('scroll', placeMenu, true);
            window.addEventListener('resize', placeMenu, true);
        }
        
        function closeMenu() {
            wrap.classList.remove('open');
            menuEl.style.display = 'none';
            if (menuEl.parentElement === document.body) wrap.appendChild(menuEl);
            window.removeEventListener('scroll', placeMenu, true);
            window.removeEventListener('resize', placeMenu, true);
        }
        
        toggleEl.onclick = (e) => { e.stopPropagation(); if (wrap.classList.contains('open')) closeMenu(); else openMenu(); };
        document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closeMenu(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    }
    
    function initSoftSelect(selectId, placeholder) {
        const sel = document.getElementById(selectId);
        const wrap = document.querySelector(`.soft-select[data-target="${selectId}"]`);
        if (!sel || !wrap) return;
        const toggle = wrap.querySelector('.soft-select-toggle');
        const menu = wrap.querySelector('.soft-select-menu');
        buildSoftSelect(sel, toggle, menu, placeholder);
        sel.addEventListener('change', () => buildSoftSelect(sel, toggle, menu, placeholder));
    }
    
    // Top compact block logic
    const hostSelect = document.getElementById('st-host');
    const latestBox = document.getElementById('st-latest');
    const topCanvas = document.getElementById('st-top-canvas');
    const runForm = document.getElementById('st-run-form');
    let topChart = null;

    async function loadAndDrawTop() {
        if (!hostSelect || !topCanvas) return;
        const host = hostSelect.value;
        const url = `/admin/host-speedtests/${encodeURIComponent(host)}`;
        try {
            const resp = await fetch(url + '?limit=60', { headers: { 'Accept': 'application/json' } });
            const data = await resp.json();
            if (!data || !data.ok) return;
            const items = (data.items || []).slice().reverse();
            
            // latest line
            if (items.length) {
                const last = items[items.length - 1];
                const parts = [];
                if (last.method) parts.push(`<span class='badge bg-blue-lt'>${String(last.method).toUpperCase()}</span>`);
                parts.push(`⏱ ${last.ping_ms ?? '—'} ms`);
                parts.push(`↓ ${last.download_mbps ?? '—'} Mbps`);
                parts.push(`↑ ${last.upload_mbps ?? '—'} Mbps`);
                if (last.server_name) parts.push(`📍 ${last.server_name}`);
                parts.push(`<span class='text-secondary'>${last.created_at}</span>`);
                if (latestBox) latestBox.innerHTML = parts.join(' · ');
            } else {
                if (latestBox) latestBox.textContent = 'Нет данных';
            }
            
            // chart
            const labels = items.map(it => it.created_at);
            const series = items.map(it => Number(it.download_mbps || 0));
            const seriesUp = items.map(it => Number(it.upload_mbps || 0));
            
            if (window.Chart && topCanvas) {
                if (topChart) topChart.destroy();
                topChart = new Chart(topCanvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Download',
                            data: series,
                            borderColor: '#206bc4',
                            backgroundColor: 'rgba(32, 107, 196, 0.1)',
                            borderWidth: 2,
                            fill: false,
                            tension: 0.3,
                            pointRadius: 2,
                            pointHoverRadius: 4
                        }, {
                            label: 'Upload',
                            data: seriesUp,
                            borderColor: '#2fb344',
                            backgroundColor: 'rgba(47, 179, 68, 0.1)',
                            borderWidth: 2,
                            fill: false,
                            tension: 0.3,
                            pointRadius: 2,
                            pointHoverRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top'
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { maxRotation: 45, minRotation: 45 }
                            },
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(0,0,0,0.05)' }
                            }
                        }
                    }
                });
            }
        } catch (e) {
            console.error('Error loading speedtest data:', e);
        }
    }

    // Initialize soft selects and speedtest
    initSoftSelect('st-host', 'Выберите хост...');
    if (hostSelect) {
        hostSelect.addEventListener('change', loadAndDrawTop);
        loadAndDrawTop();
    }
}
