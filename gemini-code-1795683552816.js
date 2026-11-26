/* =========================================================
   AQUASTUDY - MAIN APPLICATION LOGIC
   ========================================================= */

// 1. STATE & STORAGE KEYS
const STORAGE_KEYS = {
    TASKS: 'aquastudy_tasks_v1',
    SETTINGS: 'aquastudy_settings_v1',
    PRAYER_CACHE: 'aquastudy_prayer_v1',
    POMODORO_STATS: 'aquastudy_pomo_v1',
    NOTIFIED_LOG: 'aquastudy_notified_v1'
};

const DEFAULT_SETTINGS = {
    userName: 'Pelajar Hebat',
    avatar: 'bear', // bear | cat | bunny | hamster
    theme: 'light',
    cityMode: 'auto', // 'auto' or 'lat,lon,CityName'
    notifTask: true,
    reminderLeadMinutes: 30,
    notifPrayer: true,
    soundEnabled: true
};

let appState = {
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    prayerTimes: null, // { Fajr, Dhuhr, Asr, Maghrib, Isha }
    prayerHijri: '',
    locationLabel: 'Jakarta',
    coords: { lat: -6.2088, lon: 106.8456 },
    currentFilter: 'all',
    searchQuery: '',
    pomodoroCount: 0,
    notifiedIds: {},
    deferredInstallPrompt: null
};

// Timer State (Berbasis Timestamp agar tetap akurat walau tab pindah/tidur)
let timerState = {
    mode: 'pomodoro', // pomodoro | shortBreak | longBreak | custom | stopwatch
    status: 'idle',   // idle | running | paused
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    elapsedSec: 0,
    endTimestamp: null,
    startTimestamp: null
};

// =========================================================
// 2. INITIALIZATION
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    applyTheme(appState.settings.theme);
    renderMascotAvatar(appState.settings.avatar, 'idle');
    setupEyeTracking();
    initNavigation();
    initDynamicIsland();
    initTasksModule();
    initTimerModule();
    initSettingsModule();
    initPWA();

    // Load Jadwal Sholat & Jalankan Loop Real-time
    initPrayerModule();
    startRealtimeLoops();
    updatePermissionUI();
});

function loadFromStorage() {
    try {
        const savedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
        if (savedTasks) appState.tasks = JSON.parse(savedTasks);

        const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (savedSettings) {
            appState.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
        }

        const savedPomo = localStorage.getItem(STORAGE_KEYS.POMODORO_STATS);
        if (savedPomo) appState.pomodoroCount = parseInt(savedPomo, 10) || 0;

        const savedNotifLog = localStorage.getItem(STORAGE_KEYS.NOTIFIED_LOG);
        if (savedNotifLog) appState.notifiedIds = JSON.parse(savedNotifLog);
    } catch (err) {
        console.error('Gagal memuat data LocalStorage:', err);
    }
}

function saveTasks() {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(appState.tasks));
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
}

function saveNotifiedLog() {
    localStorage.setItem(STORAGE_KEYS.NOTIFIED_LOG, JSON.stringify(appState.notifiedIds));
}

// =========================================================
// 3. NAVIGATION & DYNAMIC ISLAND
// =========================================================
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('[data-goto]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.goto));
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `tab-${tabId}`);
    });
}

function initDynamicIsland() {
    const island = document.getElementById('dynamicIsland');
    island.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = island.classList.toggle('expanded');
        island.setAttribute('aria-expanded', isExpanded);
    });

    document.addEventListener('click', (e) => {
        if (!island.contains(e.target) && island.classList.contains('expanded')) {
            island.classList.remove('expanded');
            island.setAttribute('aria-expanded', 'false');
        }
    });
}

// =========================================================
// 4. REAL-TIME CLOCK, GREETING & LOOPS
// =========================================================
function startRealtimeLoops() {
    updateClockAndGreeting();
    renderTasks();
    updateDashboardStats();

    setInterval(() => {
        updateClockAndGreeting();
        updateTimerTick();
        updatePrayerCountdown();
        checkDeadlineReminders();
    }, 1000);
}

function updateClockAndGreeting() {
    const now = new Date();
    const hours = now.getHours();
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    const timeFull = `${String(hours).padStart(2, '0')}:${mins}:${secs}`;
    const timeShort = `${String(hours).padStart(2, '0')}:${mins}`;

    // Sapaan Waktu
    let greeting = 'Selamat Malam';
    if (hours >= 4 && hours < 11) greeting = 'Selamat Pagi';
    else if (hours >= 11 && hours < 15) greeting = 'Selamat Siang';
    else if (hours >= 15 && hours < 18) greeting = 'Selamat Sore';

    const name = appState.settings.userName || 'Pelajar';
    document.getElementById('dashGreeting').textContent = `${greeting}, ${name}!`;
    document.getElementById('dashDigitalClock').textContent = timeFull;
    document.getElementById('diClock').textContent = timeShort;

    // Tanggal Lengkap
    const dateOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = now.toLocaleDateString('id-ID', dateOptions);
    document.getElementById('dashFullDate').textContent = formattedDate;
    document.getElementById('diExpDate').textContent = now.toLocaleDateString('id-ID', {
        weekday: 'short', day: 'numeric', month: 'short'
    });
}

// =========================================================
// 5. TASKS MANAGEMENT & DEADLINE INDICATOR
// =========================================================
function initTasksModule() {
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');

    document.getElementById('openAddTaskModalBtn').addEventListener('click', () => {
        openTaskModal();
    });

    document.getElementById('closeTaskModalBtn').addEventListener('click', closeTaskModal);
    document.getElementById('cancelTaskModalBtn').addEventListener('click', closeTaskModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeTaskModal();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSaveTask();
    });

    // Filter Pills
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    // Search
    document.getElementById('taskSearchInput').addEventListener('input', (e) => {
        appState.searchQuery = e.target.value.toLowerCase();
        renderTasks();
    });
}

function openTaskModal(taskToEdit = null) {
    const modal = document.getElementById('taskModal');
    const titleEl = document.getElementById('taskModalTitle');
    document.getElementById('taskForm').reset();

    if (taskToEdit) {
        titleEl.textContent = 'Edit Tugas Sekolah';
        document.getElementById('taskIdInput').value = taskToEdit.id;
        document.getElementById('taskTitleInput').value = taskToEdit.title;
        document.getElementById('taskSubjectInput').value = taskToEdit.subject;
        document.getElementById('taskPriorityInput').value = taskToEdit.priority;
        document.getElementById('taskDeadlineInput').value = taskToEdit.deadline;
        document.getElementById('taskNotesInput').value = taskToEdit.notes || '';
    } else {
        titleEl.textContent = 'Tambah Tugas Baru';
        document.getElementById('taskIdInput').value = '';
        // Default deadline 2 jam dari sekarang
        const defaultDate = new Date(Date.now() + 2 * 3600 * 1000);
        defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset());
        document.getElementById('taskDeadlineInput').value = defaultDate.toISOString().slice(0, 16);
    }

    modal.classList.remove('hidden');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.add('hidden');
}

function handleSaveTask() {
    const id = document.getElementById('taskIdInput').value;
    const title = document.getElementById('taskTitleInput').value.trim();
    const subject = document.getElementById('taskSubjectInput').value.trim();
    const priority = document.getElementById('taskPriorityInput').value;
    const deadline = document.getElementById('taskDeadlineInput').value;
    const notes = document.getElementById('taskNotesInput').value.trim();

    if (!title || !subject || !deadline) return;

    if (id) {
        const idx = appState.tasks.findIndex(t => t.id === id);
        if (idx !== -1) {
            appState.tasks[idx] = { ...appState.tasks[idx], title, subject, priority, deadline, notes };
            showToast('Tugas berhasil diperbarui!');
        }
    } else {
        const newTask = {
            id: 'task_' + Date.now(),
            title,
            subject,
            priority,
            deadline,
            notes,
            completed: false,
            createdAt: new Date().toISOString()
        };
        appState.tasks.unshift(newTask);
        showToast('Tugas baru ditambahkan!');
        setMascotMood('excited', 'Tugas baru tercatat! Ayo cicil pelan-pelan 💪');
    }

    saveTasks();
    renderTasks();
    updateDashboardStats();
    closeTaskModal();
}

function toggleTaskComplete(id) {
    const task = appState.tasks.find(t => t.id === id);
    if (!task) return;

    task.completed = !task.completed;
    saveTasks();
    renderTasks();
    updateDashboardStats();

    if (task.completed) {
        triggerAppNotification('Tugas Selesai! 🎉', `Hebat! Kamu berhasil menyelesaikan tugas "${task.title}".`);
        setMascotMood('happy', `Yeay! Tugas ${task.subject} selesai! 🎉`);
    } else {
        setMascotMood('idle', 'Tugas dikembalikan ke daftar aktif.');
    }
}

function deleteTask(id) {
    if (!confirm('Hapus tugas ini secara permanen?')) return;
    appState.tasks = appState.tasks.filter(t => t.id !== id);
    saveTasks();
    renderTasks();
    updateDashboardStats();
    showToast('Tugas dihapus.');
}

function getTaskDeadlineStatus(task) {
    if (task.completed) {
        return { code: 'completed', className: 'status-completed', label: 'Selesai dikerjakan' };
    }
    const now = Date.now();
    const due = new Date(task.deadline).getTime();
    const diffMs = due - now;

    if (diffMs < 0) {
        return { code: 'overdue', className: 'status-overdue', label: 'Melewati Deadline!' };
    }
    if (diffMs <= 24 * 3600 * 1000) {
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        return {
            code: 'near',
            className: 'status-near',
            label: hrs > 0 ? `Sisa ${hrs} jam ${mins} menit` : `Sisa ${mins} menit lagi!`
        };
    }
    return { code: 'safe', className: 'status-safe', label: 'Terjadwal' };
}

function renderTasks() {
    const container = document.getElementById('taskListContainer');
    let filtered = [...appState.tasks];

    // Filter
    if (appState.currentFilter === 'pending') {
        filtered = filtered.filter(t => !t.completed);
    } else if (appState.currentFilter === 'completed') {
        filtered = filtered.filter(t => t.completed);
    } else if (appState.currentFilter === 'urgent') {
        filtered = filtered.filter(t => {
            const st = getTaskDeadlineStatus(t).code;
            return !t.completed && (st === 'overdue' || st === 'near');
        });
    }

    // Search
    if (appState.searchQuery) {
        filtered = filtered.filter(t =>
            t.title.toLowerCase().includes(appState.searchQuery) ||
            t.subject.toLowerCase().includes(appState.searchQuery)
        );
    }

    // Urutkan deadline terdekat
    filtered.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 32px; text-align: center; grid-column: 1 / -1;">
                <i class="ri-inbox-2-line" style="font-size: 2.5rem; color: var(--aqua-primary);"></i>
                <h3 style="margin-top: 8px;">Tidak ada tugas ditemukan</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Klik tombol "Tambah Tugas" untuk mulai mencatat jadwal belajarmu.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(task => {
        const status = getTaskDeadlineStatus(task);
        const formattedDue = new Date(task.deadline).toLocaleString('id-ID', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        return `
            <article class="task-card ${status.className}">
                <div>
                    <div class="task-top">
                        <span class="subject-tag">${escapeHtml(task.subject)}</span>
                        <span class="priority-badge prio-${task.priority}">${task.priority}</span>
                    </div>
                    <h3 class="task-title">${escapeHtml(task.title)}</h3>
                    ${task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ''}
                </div>
                <div>
                    <div class="task-meta">
                        <span><i class="ri-calendar-event-line"></i> Deadline: <strong>${formattedDue}</strong></span>
                        <span class="task-status-label"><i class="ri-time-line"></i> ${status.label}</span>
                    </div>
                    <div class="task-actions" style="margin-top: 12px;">
                        <button class="btn-check-task" onclick="toggleTaskComplete('${task.id}')">
                            <i class="${task.completed ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}"></i>
                            ${task.completed ? 'Selesai' : 'Tandai Selesai'}
                        </button>
                        <button class="btn-icon" title="Edit Tugas" onclick="editTaskById('${task.id}')">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button class="btn-icon" title="Hapus Tugas" onclick="deleteTask('${task.id}')">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

window.editTaskById = function(id) {
    const task = appState.tasks.find(t => t.id === id);
    if (task) openTaskModal(task);
};

function updateDashboardStats() {
    const total = appState.tasks.length;
    const completed = appState.tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    document.getElementById('statPending').textContent = pending;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statProgress').textContent = `${percent}%`;
    document.getElementById('statProgressBar').style.width = `${percent}%`;
    document.getElementById('navTaskBadge').textContent = pending;

    // Update Pengingat Terdekat & Dynamic Island
    const activeTasks = appState.tasks
        .filter(t => !t.completed)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    const nearestBox = document.getElementById('dashNearestTask');
    const diAlertBox = document.getElementById('diExpTaskAlert');
    const diAlertText = document.getElementById('diExpTaskText');
    const diDot = document.getElementById('diStatusDot');

    if (activeTasks.length > 0) {
        const nextTask = activeTasks[0];
        const st = getTaskDeadlineStatus(nextTask);
        const dueStr = new Date(nextTask.deadline).toLocaleString('id-ID', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        nearestBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span class="subject-tag">${escapeHtml(nextTask.subject)}</span>
                <small style="font-weight:700; color:${st.code === 'overdue' ? 'var(--status-red)' : 'var(--aqua-primary)'}">${st.label}</small>
            </div>
            <strong style="display:block; font-size:0.98rem;">${escapeHtml(nextTask.title)}</strong>
            <small style="color:var(--text-muted);">Batas waktu: ${dueStr}</small>
        `;

        diAlertText.textContent = `Tugas terdekat: ${nextTask.title} (${st.label})`;
        if (st.code === 'overdue' || st.code === 'near') {
            diAlertBox.classList.add('urgent');
            diDot.classList.add('urgent');
        } else {
            diAlertBox.classList.remove('urgent');
            diDot.classList.remove('urgent');
        }

        // Jika ada tugas overdue, ubah ekspresi maskot jadi sedih (bila timer tidak jalan)
        if (st.code === 'overdue' && timerState.status !== 'running') {
            setMascotMood('sad', `Yah, tugas "${nextTask.title}" terlewat deadline 😢`);
        }
    } else {
        nearestBox.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">Semua tugas sudah beres! Mantap! ✨</p>`;
        diAlertText.textContent = 'Semua tugas aman & terkendali.';
        diAlertBox.classList.remove('urgent');
        diDot.classList.remove('urgent');
    }
}

function checkDeadlineReminders() {
    if (!appState.settings.notifTask) return;
    const now = Date.now();
    const leadMs = appState.settings.reminderLeadMinutes * 60 * 1000;

    appState.tasks.forEach(task => {
        if (task.completed) return;
        const due = new Date(task.deadline).getTime();
        const diff = due - now;

        // Pengingat sebelum deadline
        const leadKey = `lead_${task.id}_${appState.settings.reminderLeadMinutes}`;
        if (diff > 0 && diff <= leadMs && !appState.notifiedIds[leadKey]) {
            const minsLeft = Math.ceil(diff / 60000);
            triggerAppNotification(
                'Pengingat Tugas Sekolah ⏰',
                `Jangan lupa, tugas ${task.subject} ("${task.title}") tinggal ${minsLeft} menit lagi!`
            );
            appState.notifiedIds[leadKey] = true;
            saveNotifiedLog();
        }

        // Pengingat tepat saat deadline tiba
        const dueKey = `due_${task.id}`;
        if (diff <= 0 && diff > -60000 && !appState.notifiedIds[dueKey]) {
            triggerAppNotification(
                'Batas Waktu Tugas Tiba! 🚨',
                `Deadline tugas "${task.title}" (${task.subject}) telah tiba!`
            );
            setMascotMood('sad', `Deadline ${task.subject} sudah tiba!`);
            appState.notifiedIds[dueKey] = true;
            saveNotifiedLog();
        }
    });
}

// =========================================================
// 6. JADWAL SHOLAT (ALADHAN API + GPS / MANUAL)
// =========================================================
function initPrayerModule() {
    const citySelect = document.getElementById('manualCitySelect');
    citySelect.value = appState.settings.cityMode || 'auto';

    citySelect.addEventListener('change', (e) => {
        appState.settings.cityMode = e.target.value;
        saveSettings();
        resolvePrayerLocation();
    });

    document.getElementById('detectGpsBtn').addEventListener('click', () => {
        appState.settings.cityMode = 'auto';
        citySelect.value = 'auto';
        saveSettings();
        resolvePrayerLocation(true);
    });

    resolvePrayerLocation();
}

function resolvePrayerLocation(forceRefresh = false) {
    const mode = appState.settings.cityMode;

    if (mode !== 'auto') {
        const [lat, lon, cityName] = mode.split(',');
        appState.coords = { lat: parseFloat(lat), lon: parseFloat(lon) };
        appState.locationLabel = cityName;
        fetchPrayerTimes(appState.coords.lat, appState.coords.lon, cityName);
        return;
    }

    // Mode Otomatis GPS
    if ('geolocation' in navigator) {
        document.getElementById('dashLocationLabel').innerHTML = `<i class="ri-loader-4-line"></i> Mendeteksi GPS...`;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                appState.coords = { lat: latitude, lon: longitude };
                appState.locationLabel = 'Lokasi GPS Anda';
                fetchPrayerTimes(latitude, longitude, 'Lokasi GPS Anda');
            },
            (err) => {
                console.warn('GPS ditolak/gagal, fallback ke Jakarta:', err);
                appState.locationLabel = 'Jakarta (Default)';
                fetchPrayerTimes(-6.2088, 106.8456, 'Jakarta (Default)');
                if (forceRefresh) {
                    showToast('Izin lokasi tidak aktif. Menggunakan jadwal Jakarta.');
                }
            },
            { timeout: 8000 }
        );
    } else {
        fetchPrayerTimes(-6.2088, 106.8456, 'Jakarta');
    }
}

async function fetchPrayerTimes(lat, lon, label) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const cacheKey = `${todayStr}_${lat.toFixed(2)}_${lon.toFixed(2)}`;

    // Cek Cache Hari Ini agar hemat kuota & cepat
    try {
        const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRAYER_CACHE) || '{}');
        if (cached.key === cacheKey && cached.timings) {
            appState.prayerTimes = cached.timings;
            appState.prayerHijri = cached.hijri;
            appState.locationLabel = label;
            renderPrayerCards();
            return;
        }
    } catch (_) {}

    try {
        // Method 20 = Kementerian Agama Republik Indonesia (KEMENAG)
        const url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=20`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 200 && data.data) {
            const t = data.data.timings;
            const cleanTimings = {
                Subuh: t.Fajr.split(' ')[0],
                Dzuhur: t.Dhuhr.split(' ')[0],
                Ashar: t.Asr.split(' ')[0],
                Maghrib: t.Maghrib.split(' ')[0],
                Isya: t.Isha.split(' ')[0]
            };
            const hijri = `${data.data.date.hijri.day} ${data.data.date.hijri.month.en} ${data.data.date.hijri.year} H`;

            appState.prayerTimes = cleanTimings;
            appState.prayerHijri = hijri;
            appState.locationLabel = label;

            localStorage.setItem(STORAGE_KEYS.PRAYER_CACHE, JSON.stringify({
                key: cacheKey,
                timings: cleanTimings,
                hijri
            }));

            renderPrayerCards();
        }
    } catch (error) {
        console.error('Error mengambil jadwal sholat:', error);
        document.getElementById('prayerBannerName').textContent = 'Gagal memuat API';
    }
}

function getNextPrayerInfo() {
    if (!appState.prayerTimes) return null;

    const now = new Date();
    const order = ['Subuh', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya'];

    for (const name of order) {
        const [hh, mm] = appState.prayerTimes[name].split(':').map(Number);
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
        if (target > now) {
            return { name, timeStr: appState.prayerTimes[name], targetDate: target, isTomorrow: false };
        }
    }

    // Jika sudah lewat Isya, target berikutnya adalah Subuh besok
    const [sh, sm] = appState.prayerTimes.Subuh.split(':').map(Number);
    const tomorrowSubuh = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, sh, sm, 0);
    return { name: 'Subuh', timeStr: appState.prayerTimes.Subuh, targetDate: tomorrowSubuh, isTomorrow: true };
}

function renderPrayerCards() {
    if (!appState.prayerTimes) return;
    const nextInfo = getNextPrayerInfo();
    const icons = {
        Subuh: 'ri-haze-line',
        Dzuhur: 'ri-sun-fill',
        Ashar: 'ri-sun-cloudy-line',
        Maghrib: 'ri-sunset-line',
        Isya: 'ri-moon-clear-fill'
    };

    document.getElementById('dashLocationLabel').innerHTML = `<i class="ri-map-pin-line"></i> ${appState.locationLabel}`;
    document.getElementById('prayerHijriDate').textContent = appState.prayerHijri;
    document.getElementById('prayerCoordsInfo').textContent =
        `Koordinat: ${appState.coords.lat.toFixed(3)}, ${appState.coords.lon.toFixed(3)} • Kemenag RI`;

    // Render Mini List di Dashboard
    const miniContainer = document.getElementById('dashMiniPrayerList');
    miniContainer.innerHTML = Object.entries(appState.prayerTimes).map(([name, time]) => `
        <div class="mini-prayer-item ${nextInfo && nextInfo.name === name ? 'next' : ''}">
            <span>${name}</span>
            <strong>${time}</strong>
        </div>
    `).join('');

    // Render 5 Kartu Utama
    const gridContainer = document.getElementById('prayerCardsGrid');
    gridContainer.innerHTML = Object.entries(appState.prayerTimes).map(([name, time]) => {
        const isNext = nextInfo && nextInfo.name === name;
        return `
            <div class="glass-card prayer-card ${isNext ? 'active-next' : ''}">
                <div class="prayer-card-icon"><i class="${icons[name]}"></i></div>
                <h3>${name}</h3>
                <div class="p-time">${time}</div>
                ${isNext ? '<span class="prayer-next-pill">Berikutnya</span>' : ''}
            </div>
        `;
    }).join('');
}

function updatePrayerCountdown() {
    if (!appState.prayerTimes) return;
    const now = new Date();
    const nextInfo = getNextPrayerInfo();
    if (!nextInfo) return;

    const diffMs = nextInfo.targetDate - now;
    const hrs = String(Math.floor(diffMs / 3600000)).padStart(2, '0');
    const mins = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
    const secs = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');
    const countdownStr = `${hrs}:${mins}:${secs}`;

    // Update UI di semua lokasi (Dashboard, Tab Sholat, Dynamic Island)
    document.getElementById('dashNextPrayerName').textContent = nextInfo.name;
    document.getElementById('dashNextPrayerCountdown').textContent = countdownStr;
    document.getElementById('prayerBannerName').textContent = `${nextInfo.name} (${nextInfo.timeStr})`;
    document.getElementById('prayerBannerCountdown').textContent = `${hrs} : ${mins} : ${secs}`;

    document.getElementById('diNextPrayerText').textContent = `${nextInfo.name} -${hrs}:${mins}`;
    document.getElementById('diExpPrayerName').textContent = `${nextInfo.name} (${nextInfo.timeStr})`;
    document.getElementById('diExpPrayerCountdown').textContent = countdownStr;

    // Cek Notifikasi Masuk Waktu Sholat
    const todayKey = now.toISOString().slice(0, 10);
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    Object.entries(appState.prayerTimes).forEach(([pName, pTime]) => {
        const logKey = `prayer_${todayKey}_${pName}`;
        if (currentHHMM === pTime && !appState.notifiedIds[logKey]) {
            appState.notifiedIds[logKey] = true;
            saveNotifiedLog();
            renderPrayerCards();
            if (appState.settings.notifPrayer) {
                triggerAppNotification(
                    `Waktu Sholat ${pName} 🕌`,
                    `Telah masuk waktu sholat ${pName} (${pTime}) untuk wilayah ${appState.locationLabel}.`
                );
            }
        }
    });
}

// =========================================================
// 7. TIMER, STOPWATCH & FOCUS MODE (POMODORO)
// =========================================================
function initTimerModule() {
    document.getElementById('pomodoroSessionCount').textContent = appState.pomodoroCount;

    // Mode buttons
    document.querySelectorAll('.t-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.t-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setTimerMode(btn.dataset.tmode);
        });
    });

    // Custom timer apply
    document.getElementById('applyCustomTimerBtn').addEventListener('click', () => {
        const mins = parseInt(document.getElementById('customMinutesInput').value, 10) || 25;
        timerState.durationSec = Math.max(1, Math.min(180, mins)) * 60;
        resetTimer();
    });

    // Main Timer Controls
    document.getElementById('timerStartBtn').addEventListener('click', startTimer);
    document.getElementById('timerPauseBtn').addEventListener('click', pauseTimer);
    document.getElementById('timerResumeBtn').addEventListener('click', startTimer);
    document.getElementById('timerResetBtn').addEventListener('click', resetTimer);

    // Dashboard Mini Timer Controls
    document.getElementById('dashTimerToggleBtn').addEventListener('click', () => {
        if (timerState.status === 'running') pauseTimer();
        else startTimer();
    });
    document.getElementById('dashTimerResetBtn').addEventListener('click', resetTimer);

    updateTimerDisplayUI();
}

function setTimerMode(mode) {
    timerState.mode = mode;
    timerState.status = 'idle';
    const customBox = document.getElementById('customTimerSetup');
    customBox.classList.toggle('hidden', mode !== 'custom');

    const labels = {
        pomodoro: 'FOKUS BELAJAR (25M)',
        shortBreak: 'ISTIRAHAT SINGKAT (5M)',
        longBreak: 'ISTIRAHAT PANJANG (15M)',
        custom: 'CUSTOM TIMER',
        stopwatch: 'STOPWATCH'
    };
    document.getElementById('timerModeLabel').textContent = labels[mode];
    document.getElementById('diExpTimerMode').textContent = labels[mode];

    if (mode === 'pomodoro') timerState.durationSec = 25 * 60;
    else if (mode === 'shortBreak') timerState.durationSec = 5 * 60;
    else if (mode === 'longBreak') timerState.durationSec = 15 * 60;
    else if (mode === 'custom') {
        const mins = parseInt(document.getElementById('customMinutesInput').value, 10) || 45;
        timerState.durationSec = mins * 60;
    } else if (mode === 'stopwatch') {
        timerState.durationSec = 0;
        timerState.elapsedSec = 0;
    }

    timerState.remainingSec = timerState.durationSec;
    syncTimerButtonsUI();
    updateTimerDisplayUI();
}

function startTimer() {
    if (timerState.status === 'running') return;
    timerState.status = 'running';

    if (timerState.mode === 'stopwatch') {
        timerState.startTimestamp = Date.now() - (timerState.elapsedSec * 1000);
    } else {
        timerState.endTimestamp = Date.now() + (timerState.remainingSec * 1000);
    }

    document.getElementById('timerStatusText').textContent = 'Sedang berjalan...';
    syncTimerButtonsUI();

    if (timerState.mode === 'shortBreak' || timerState.mode === 'longBreak') {
        setMascotMood('sleepy', 'Waktunya istirahat sejenak, rilekskan mata~ 😴');
    } else {
        setMascotMood('excited', 'Mode fokus aktif! Aku menemanimu belajar! 🔥');
    }
}

function pauseTimer() {
    if (timerState.status !== 'running') return;
    timerState.status = 'paused';
    document.getElementById('timerStatusText').textContent = 'Dijeda';
    syncTimerButtonsUI();
    setMascotMood('idle', 'Timer dijeda. Lanjutkan kalau sudah siap!');
}

function resetTimer() {
    timerState.status = 'idle';
    timerState.remainingSec = timerState.durationSec;
    timerState.elapsedSec = 0;
    timerState.endTimestamp = null;
    timerState.startTimestamp = null;

    document.getElementById('timerStatusText').textContent = 'Siap dimulai';
    syncTimerButtonsUI();
    updateTimerDisplayUI();
    setMascotMood('idle', 'Timer diatur ulang.');
}

function updateTimerTick() {
    if (timerState.status !== 'running') return;

    if (timerState.mode === 'stopwatch') {
        timerState.elapsedSec = Math.floor((Date.now() - timerState.startTimestamp) / 1000);
        updateTimerDisplayUI();
        return;
    }

    const diffSec = Math.ceil((timerState.endTimestamp - Date.now()) / 1000);
    if (diffSec <= 0) {
        timerState.remainingSec = 0;
        timerState.status = 'idle';
        updateTimerDisplayUI();
        syncTimerButtonsUI();
        handleTimerComplete();
    } else {
        timerState.remainingSec = diffSec;
        updateTimerDisplayUI();
    }
}

function handleTimerComplete() {
    document.getElementById('timerStatusText').textContent = 'Selesai!';

    if (timerState.mode === 'pomodoro') {
        appState.pomodoroCount += 1;
        localStorage.setItem(STORAGE_KEYS.POMODORO_STATS, appState.pomodoroCount);
        document.getElementById('pomodoroSessionCount').textContent = appState.pomodoroCount;

        triggerAppNotification('Sesi Fokus Selesai! ☕', 'Waktu fokus selesai, saatnya istirahat sejenak.');
        setMascotMood('sleepy', 'Sesi fokus selesai! Istirahat dulu yuk 😴✨');

        // Otomatis sarankan istirahat panjang tiap 4 sesi
        const nextBreak = appState.pomodoroCount % 4 === 0 ? 'longBreak' : 'shortBreak';
        document.querySelector(`.t-mode-btn[data-tmode="${nextBreak}"]`).click();
    } else {
        triggerAppNotification('Waktu Istirahat Habis! 📚', 'Ayo kembali fokus menyelesaikan target belajarmu.');
        setMascotMood('excited', 'Istirahat selesai! Ayo lanjut belajar lagi! 🚀');
        document.querySelector(`.t-mode-btn[data-tmode="pomodoro"]`).click();
    }
}

function updateTimerDisplayUI() {
    const secToShow = timerState.mode === 'stopwatch' ? timerState.elapsedSec : timerState.remainingSec;
    const formatted = formatSeconds(secToShow);

    document.getElementById('mainTimerDisplay').textContent = formatted;
    document.getElementById('dashMiniTimerDisplay').textContent = formatted;
    document.getElementById('diMiniTimer').textContent = formatted;
    document.getElementById('diExpTimerValue').textContent = formatted;

    // Update Ring SVG
    const circle = document.getElementById('timerRingProgress');
    const circumference = 722.56;
    if (timerState.mode === 'stopwatch' || timerState.durationSec === 0) {
        circle.style.strokeDashoffset = 0;
    } else {
        const ratio = timerState.remainingSec / timerState.durationSec;
        circle.style.strokeDashoffset = circumference * (1 - ratio);
    }
}

function syncTimerButtonsUI() {
    const startBtn = document.getElementById('timerStartBtn');
    const pauseBtn = document.getElementById('timerPauseBtn');
    const resumeBtn = document.getElementById('timerResumeBtn');
    const dashBtn = document.getElementById('dashTimerToggleBtn');

    startBtn.classList.toggle('hidden', timerState.status !== 'idle');
    pauseBtn.classList.toggle('hidden', timerState.status !== 'running');
    resumeBtn.classList.toggle('hidden', timerState.status !== 'paused');

    if (timerState.status === 'running') {
        dashBtn.innerHTML = `<i class="ri-pause-fill"></i> Jeda`;
    } else {
        dashBtn.innerHTML = `<i class="ri-play-fill"></i> ${timerState.status === 'paused' ? 'Lanjut' : 'Mulai'}`;
    }
}

function formatSeconds(totalSec) {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// =========================================================
// 8. INTERACTIVE MASCOT AVATAR + EYE TRACKING
// =========================================================
function renderMascotAvatar(type = 'bear', mood = 'idle') {
    const wrapper = document.getElementById('mascotSvgWrapper');
    const palettes = {
        bear: { ear: '#38bdf8', innerEar: '#bae6fd', head: '#e0f2fe', muzzle: '#ffffff', nose: '#0284c7' },
        cat: { ear: '#f1f5f9', innerEar: '#fbcfe8', head: '#ffffff', muzzle: '#f8fafc', nose: '#f472b6' },
        bunny: { ear: '#e0f2fe', innerEar: '#bae6fd', head: '#ffffff', muzzle: '#f0f9ff', nose: '#38bdf8' },
        hamster: { ear: '#fde68a', innerEar: '#fbcfe8', head: '#fef3c7', muzzle: '#ffffff', nose: '#f59e0b' }
    };
    const p = palettes[type] || palettes.bear;

    // Bentuk telinga berbeda tiap hewan
    let earsSvg = '';
    if (type === 'bunny') {
        earsSvg = `
            <ellipse cx="42" cy="24" rx="11" ry="24" fill="${p.ear}" stroke="#0f2942" stroke-width="2.5"/>
            <ellipse cx="42" cy="24" rx="5" ry="16" fill="${p.innerEar}"/>
            <ellipse cx="78" cy="24" rx="11" ry="24" fill="${p.ear}" stroke="#0f2942" stroke-width="2.5"/>
            <ellipse cx="78" cy="24" rx="5" ry="16" fill="${p.innerEar}"/>
        `;
    } else if (type === 'cat') {
        earsSvg = `
            <polygon points="24,48 32,16 54,36" fill="${p.ear}" stroke="#0f2942" stroke-width="2.5" stroke-linejoin="round"/>
            <polygon points="96,48 88,16 66,36" fill="${p.ear}" stroke="#0f2942" stroke-width="2.5" stroke-linejoin="round"/>
        `;
    } else {
        earsSvg = `
            <circle cx="30" cy="34" r="15" fill="${p.ear}" stroke="#0f2942" stroke-width="2.5"/>
            <circle cx="30" cy="34" r="8" fill="${p.innerEar}"/>
            <circle cx="90" cy="34" r="15" fill="${p.ear}" stroke="#0f2942" stroke-width="2.5"/>
            <circle cx="90" cy="34" r="8" fill="${p.innerEar}"/>
        `;
    }

    // Ekspresi mulut & alis sesuai mood
    let mouthSvg = `<path d="M 52 78 Q 60 85 68 78" fill="none" stroke="#0f2942" stroke-width="2.8" stroke-linecap="round"/>`;
    let extraMoodSvg = '';

    if (mood === 'happy' || mood === 'excited') {
        mouthSvg = `<path d="M 48 76 Q 60 92 72 76 Z" fill="#fb7185" stroke="#0f2942" stroke-width="2.5"/>`;
        extraMoodSvg = `<text x="92" y="28" font-size="16">✨</text>`;
    } else if (mood === 'sad') {
        mouthSvg = `<path d="M 50 84 Q 60 75 70 84" fill="none" stroke="#0f2942" stroke-width="2.8" stroke-linecap="round"/>`;
        extraMoodSvg = `<circle cx="36" cy="70" r="3" fill="#38bdf8"/>`;
    } else if (mood === 'sleepy') {
        mouthSvg = `<circle cx="60" cy="80" r="5" fill="#0f2942"/>`;
        extraMoodSvg = `<text x="86" y="26" font-size="14" fill="#0284c7" font-weight="bold">Zzz</text>`;
    }

    wrapper.innerHTML = `
        <svg viewBox="0 0 120 120" width="100%" height="100%" aria-label="Maskot Karakter">
            ${earsSvg}
            <!-- Kepala -->
            <circle cx="60" cy="66" r="42" fill="${p.head}" stroke="#0f2942" stroke-width="2.8"/>
            <!-- Pipi Merona -->
            <ellipse cx="34" cy="72" rx="7" ry="4.5" fill="#fda4af" opacity="0.7"/>
            <ellipse cx="86" cy="72" rx="7" ry="4.5" fill="#fda4af" opacity="0.7"/>
            <!-- Moncong -->
            <ellipse cx="60" cy="76" rx="18" ry="14" fill="${p.muzzle}"/>
            <!-- Mata Kiri & Kanan (Putih + Pupil yang bergerak) -->
            <g class="eye-group">
                <circle cx="44" cy="58" r="8.5" fill="#ffffff" stroke="#0f2942" stroke-width="2"/>
                <circle id="pupilLeft" cx="44" cy="58" r="4.5" fill="#0f2942"/>
                <circle id="glintLeft" cx="45.5" cy="56.5" r="1.6" fill="#ffffff"/>
                <rect class="mascot-eyelid" x="34" y="48" width="20" height="20" rx="8" fill="${p.head}"/>
            </g>
            <g class="eye-group">
                <circle cx="76" cy="58" r="8.5" fill="#ffffff" stroke="#0f2942" stroke-width="2"/>
                <circle id="pupilRight" cx="76" cy="58" r="4.5" fill="#0f2942"/>
                <circle id="glintRight" cx="77.5" cy="56.5" r="1.6" fill="#ffffff"/>
                <rect class="mascot-eyelid" x="66" y="48" width="20" height="20" rx="8" fill="${p.head}"/>
            </g>
            <!-- Hidung & Mulut -->
            <ellipse cx="60" cy="70" rx="5.5" ry="4" fill="${p.nose}"/>
            ${mouthSvg}
            ${extraMoodSvg}
        </svg>
    `;

    // Klik Maskot untuk Respons Interaktif
    const mascotBox = document.getElementById('mascotBox');
    mascotBox.onclick = () => {
        const quotes = [
            'Kamu pasti bisa menyelesaikan semua tugas hari ini! 🌟',
            'Jangan lupa minum air putih dan jaga sholat ya! 💧',
            'Klik timer fokus kalau butuh teman belajar bareng! ⏱️',
            'Sedikit demi sedikit, tugas menumpuk pasti selesai! 📚'
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        setMascotMood('happy', randomQuote);
        setTimeout(() => setMascotMood('idle'), 3500);
    };
}

function setMascotMood(mood, speechText = null) {
    const moodLabels = {
        idle: 'Mode Santai',
        happy: 'Senang Banget!',
        excited: 'Mode Fokus!',
        sleepy: 'Waktunya Istirahat',
        sad: 'Deadline Terlewat'
    };
    renderMascotAvatar(appState.settings.avatar, mood);
    const wrapper = document.getElementById('mascotSvgWrapper');
    wrapper.classList.toggle('excited', mood === 'happy' || mood === 'excited');
    document.getElementById('mascotMoodTag').textContent = moodLabels[mood] || 'Mode Santai';

    if (speechText) {
        document.getElementById('mascotSpeech').textContent = speechText;
    }
}

function setupEyeTracking() {
    const moveEyes = (clientX, clientY) => {
        const stage = document.getElementById('mascotStage');
        const pupilL = document.getElementById('pupilLeft');
        const pupilR = document.getElementById('pupilRight');
        const glintL = document.getElementById('glintLeft');
        const glintR = document.getElementById('glintRight');
        if (!stage || !pupilL || !pupilR) return;

        const rect = stage.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const angle = Math.atan2(clientY - centerY, clientX - centerX);
        const maxOffset = 3.2;
        const dx = Math.cos(angle) * maxOffset;
        const dy = Math.sin(angle) * maxOffset;

        pupilL.setAttribute('cx', 44 + dx);
        pupilL.setAttribute('cy', 58 + dy);
        glintL.setAttribute('cx', 45.5 + dx);
        glintL.setAttribute('cy', 56.5 + dy);

        pupilR.setAttribute('cx', 76 + dx);
        pupilR.setAttribute('cy', 58 + dy);
        glintR.setAttribute('cx', 77.5 + dx);
        glintR.setAttribute('cy', 56.5 + dy);
    };

    // Desktop Mouse Move
    window.addEventListener('mousemove', (e) => moveEyes(e.clientX, e.clientY));

    // Mobile Touch Move
    window.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) {
            moveEyes(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });
}

// =========================================================
// 9. WEB NOTIFICATIONS & WEB AUDIO SOUND
// =========================================================
function updatePermissionUI() {
    const statusEl = document.getElementById('notifPermissionStatus');
    if (!('Notification' in window)) {
        statusEl.textContent = 'Status: Browser tidak mendukung Web Notifications';
        return;
    }
    const map = {
        granted: 'Aktif (Diizinkan ✅)',
        denied: 'Diblokir oleh Browser ❌',
        default: 'Belum diaktifkan ⚠️'
    };
    statusEl.textContent = `Status: ${map[Notification.permission]}`;
}

function triggerAppNotification(title, body) {
    showToast(`${title} — ${body}`);

    if (appState.settings.soundEnabled) {
        playGentleChime();
    }

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body,
                icon: 'assets/icon.png',
                badge: 'assets/icon.png'
            });
        } catch (e) {
            console.warn('Notifikasi sistem gagal ditampilkan:', e);
        }
    }
}

function playGentleChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 (Aqua Chime)
        notes.forEach((freq, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.14);
            gain.gain.setValueAtTime(0.12, ctx.currentTime + index * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.14 + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + index * 0.14);
            osc.stop(ctx.currentTime + index * 0.14 + 0.45);
        });
    } catch (_) {}
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.innerHTML = `<i class="ri-notification-3-fill" style="color:#38bdf8; font-size:1.2rem;"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 300);
    }, 4200);
}

// =========================================================
// 10. SETTINGS MODULE
// =========================================================
function initSettingsModule() {
    const nameInput = document.getElementById('settingUserName');
    const notifTaskChk = document.getElementById('settingNotifTask');
    const leadSelect = document.getElementById('settingReminderLead');
    const notifPrayerChk = document.getElementById('settingNotifPrayer');
    const soundChk = document.getElementById('settingSoundEnabled');

    // Populate Form
    nameInput.value = appState.settings.userName;
    notifTaskChk.checked = appState.settings.notifTask;
    leadSelect.value = appState.settings.reminderLeadMinutes;
    notifPrayerChk.checked = appState.settings.notifPrayer;
    soundChk.checked = appState.settings.soundEnabled;

    // Avatar Choice Buttons
    document.querySelectorAll('.avatar-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.avatar === appState.settings.avatar);
        btn.addEventListener('click', () => {
            document.querySelectorAll('.avatar-choice').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.settings.avatar = btn.dataset.avatar;
            renderMascotAvatar(appState.settings.avatar, 'happy');
        });
    });

    // Theme Choice Buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeVal === appState.settings.theme);
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.settings.theme = btn.dataset.themeVal;
            applyTheme(appState.settings.theme);
        });
    });

    // Request Browser Notification Permission
    document.getElementById('requestNotifPermBtn').addEventListener('click', async () => {
        if (!('Notification' in window)) {
            showToast('Browser ini tidak mendukung Web Notifications.');
            return;
        }
        const perm = await Notification.requestPermission();
        updatePermissionUI();
        if (perm === 'granted') {
            triggerAppNotification('Notifikasi Aktif!', 'Pengingat tugas dan waktu sholat siap digunakan.');
        }
    });

    // Test Notification
    document.getElementById('testNotificationBtn').addEventListener('click', () => {
        triggerAppNotification('Tes Pengingat AquaStudy', 'Suara dan notifikasi pengingat berfungsi dengan baik!');
    });

    // Save Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        appState.settings.userName = nameInput.value.trim() || 'Pelajar Hebat';
        appState.settings.notifTask = notifTaskChk.checked;
        appState.settings.reminderLeadMinutes = parseInt(leadSelect.value, 10);
        appState.settings.notifPrayer = notifPrayerChk.checked;
        appState.settings.soundEnabled = soundChk.checked;

        saveSettings();
        updateClockAndGreeting();
        showToast('Pengaturan berhasil disimpan!');
    });

    // Reset All Data
    document.getElementById('resetAllDataBtn').addEventListener('click', () => {
        if (!confirm('PERINGATAN: Semua tugas, riwayat fokus, dan pengaturan akan dihapus. Lanjutkan?')) return;
        Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
        location.reload();
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

// =========================================================
// 11. PWA SERVICE WORKER & INSTALL PROMPT
// =========================================================
function initPWA() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(() => console.log('Service Worker terdaftar.'))
                .catch(err => console.warn('Service Worker gagal:', err));
        });
    }

    const installBtn = document.getElementById('installAppBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        appState.deferredInstallPrompt = e;
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        if (!appState.deferredInstallPrompt) return;
        appState.deferredInstallPrompt.prompt();
        const { outcome } = await appState.deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
            installBtn.classList.add('hidden');
        }
        appState.deferredInstallPrompt = null;
    });
}

// Helper keamanan XSS
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}