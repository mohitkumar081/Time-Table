const DAYS       = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
const DAY_LABELS = { MONDAY:'Monday', TUESDAY:'Tuesday', WEDNESDAY:'Wednesday', THURSDAY:'Thursday', FRIDAY:'Friday' };
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes auto-refresh

// ─── Google Sheets Live Config ────────────────────────────────
const SHEET_PUB_ID = '1lO7z-XERgpNst3HDQnSFnMPFu8USTAdTliUUO_xDDck';
const SHEET_GIDS = {
  MONDAY:    '1082599964',
  TUESDAY:   '1552752041',
  WEDNESDAY: '33479239',
  THURSDAY:  '678536264',
  FRIDAY:    '1292472437',
};

const TIME_SLOT_ORDER = {
  '08:00-8:50':1,'08:00-08:50':1,
  '08:55-09:45':2,
  '09:50:-10:40':3,'09:50-10:40':3,
  '10:45-11:35':4,
  '11:40-12:30':5,
  '12:35-1:25':6,
  '1:30-2:20':7,
  '2:25-3:15':8,
  '3:20-4:10':9,
};

function parseCourseSection(line) {
  const m = line.match(/\b(B[A-Z]{1,3}-\d+[A-Z])/);
  if (m) {
    const idx = line.indexOf(m[0]);
    return { courseCode: line.slice(0, idx).trim(), section: line.slice(idx).trim() };
  }
  const parts = line.split(' ');
  return { courseCode: parts[0] || '', section: parts.slice(1).join(' ') };
}

function parseCSVToEntries(csvText, day) {
  const entries = [];

  // Proper CSV parser that handles quoted newlines
  function parseCSV(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQ && text[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        row.push(cur); cur = '';
      } else if ((ch === '\n' || (ch === '\r' && text[i+1] === '\n')) && !inQ) {
        if (ch === '\r') i++;
        row.push(cur); rows.push(row);
        row = []; cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  const rows = parseCSV(csvText);

  // Find time row
  let timeRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some(c => /\d{1,2}:\d{2}/.test(c || ''))) { timeRowIdx = i; break; }
  }
  if (timeRowIdx === -1) return entries;

  const slotTimes = {};
  rows[timeRowIdx].forEach((val, ci) => {
    const v = (val || '').trim();
    if (v && /\d{1,2}:\d{2}/.test(v)) slotTimes[ci] = v;
  });

  const SKIP = new Set(['classrooms','computing labs','engineering labs','venues/time','slots','']);
  const SKIP_START = ['reserved','classrooms','computing','engineering'];

  for (let r = timeRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !(row[0] || '').trim()) continue;
    const room = row[0].trim();
    if (!room || SKIP.has(room.toLowerCase())) continue;
    if (SKIP_START.some(s => room.toLowerCase().startsWith(s))) continue;

    Object.entries(slotTimes).forEach(([ci, time]) => {
      const cell = (row[+ci] || '').trim();
      if (!cell) return;

      // Cell contains "CourseCode Section\nTeacher" (newline inside quotes)
      const lines = cell.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return;

      const { courseCode, section } = parseCourseSection(lines[0]);
      const teacher = lines.slice(1).join(' ').trim();

      if (!courseCode) return;

      entries.push({
        day, time, room, courseCode, section, teacher,
        slot: TIME_SLOT_ORDER[time] || 99,
        key: `${day}|${time}|${room}|${courseCode}|${section}`
      });
    });
  }
  return entries;
}

async function fetchDayFromSheets(day) {
  const gid = SHEET_GIDS[day];
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_PUB_ID}/export?format=csv&gid=${gid}`;
  const proxies = [
    url,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];
  for (const u of proxies) {
    try {
      const res = await fetch(u + '&t=' + Date.now());
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length < 50 || text.toLowerCase().includes('sign in')) continue;
      console.log(`✅ ${day}: ${text.length} chars`);
      return text;
    } catch(e) { console.warn(`fetch failed: ${e.message}`); }
  }
  throw new Error(`Could not fetch ${day}`);
}

// ─── State ───────────────────────────────────────────────────
let allClasses    = [];
let myClassKeys   = new Set(JSON.parse(localStorage.getItem('myClasses') || '[]'));
let currentView   = 'all';
let currentDay    = 'All';
let currentQuery  = '';
let modalSelected = new Set();
let currentRealDay = null;
let loadError    = '';

// ─── DOM refs ────────────────────────────────────────────────
const loadingScreen   = document.getElementById('loadingScreen');
const searchInput     = document.getElementById('searchInput');
const resultsArea     = document.getElementById('resultsArea');
const addClassesWrap  = document.getElementById('addClassesWrap');
const modalOverlay    = document.getElementById('modalOverlay');
const modalList       = document.getElementById('modalList');
const modalSearchInput= document.getElementById('modalSearchInput');
const frResultsArea   = document.getElementById('frResultsArea');
const frSlotSelect    = document.getElementById('frSlotSelect');
const frDaySelect     = document.getElementById('frDaySelect');

// ─── Data Fetch from timetable.json ──────────────────────────
// timetable.json is generated from the xlsx and placed in data/ folder
// Update it by running: python generate_timetable.py
async function loadLiveData() {
  // Try live Google Sheets first
  try {
    const allEntries = [];
    for (const day of DAYS) {
      try {
        const csv = await fetchDayFromSheets(day);
        const entries = parseCSVToEntries(csv, day);
        allEntries.push(...entries);
        console.log(`✅ ${day}: ${entries.length} entries`);
      } catch(e) {
        console.warn(`❌ ${day} failed:`, e.message);
      }
    }
    if (allEntries.length > 100) {
      console.log(`🔄 Live data loaded: ${allEntries.length} entries`);
      return allEntries;
    }
  } catch(e) {
    console.warn('Live fetch failed, trying JSON fallback:', e.message);
  }

  // Fallback to static JSON
  const urls = ['data/timetable.json', 'timetable.json'];
  for (const url of urls) {
    try {
      const res = await fetch(url + '?t=' + Date.now());
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log('✅ Fallback JSON loaded:', data.length, 'entries');
        return data;
      }
    } catch(e) { console.warn('JSON fallback failed:', e.message); }
  }
  throw new Error('Could not load timetable data');
}

async function refreshData() {
  try {
    const entries = await loadLiveData();
    allClasses = entries;
    loadError = '';
    console.log('🔄 Timetable refreshed —', allClasses.length, 'entries loaded');
    populateSlotFilter();
    renderTimetable();
    updateCurrentDayHighlight();
    hideLoading();
  } catch (err) {
    console.error('Error loading data:', err);
    loadError = 'Could not load timetable data.';
    if (!allClasses.length) {
      showLoadError('Could not load timetable. Please try again later.');
    }
    hideLoading();
  }
}

async function init() {
  hideLoading();
  await refreshData();
  setInterval(refreshData, REFRESH_INTERVAL_MS);
}

function hideLoading() {
  loadingScreen.classList.add('hidden');
  setTimeout(() => loadingScreen.style.display = 'none', 500);
}

function showLoadError(message) {
  loadingScreen.innerHTML = `
    <div class="loader-content">
      <p style="color:#111827;font-size:1.1rem;font-weight:700;">⚠️ ${message}</p>
      <button onclick="location.reload()" style="margin-top:1rem;background:#4f46e5;color:#fff;border:none;padding:0.6rem 1.5rem;border-radius:50px;cursor:pointer;font-size:0.9rem;">Retry</button>
    </div>`;
  loadingScreen.classList.remove('hidden');
  loadingScreen.style.display = 'flex';
}

function populateSlotFilter() {
  const times = [...new Set(allClasses.map(c => c.time))].sort();
  frSlotSelect.innerHTML = times.map(t => `<option value="${t}">${t}</option>`).join('');
}

// ─── TIMETABLE RENDER ────────────────────────────────────────

// Convert "08:55-09:45" → minutes from midnight for sorting
function timeToMinutes(timeStr) {
  if (!timeStr) return 9999;
  const start = timeStr.split('-')[0].trim().replace(':-', ':');
  const parts = start.split(':');
  if (parts.length < 2) return 9999;
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// My Classes: store as "courseCode|section" (day-independent)
function getMyClassSignatures() {
  const sigs = new Set();
  myClassKeys.forEach(key => {
    // key format: "DAY|time|room|courseCode|section"
    const parts = key.split('|');
    if (parts.length >= 5) {
      sigs.add(parts[3] + '|' + parts[4]); // courseCode|section
    }
  });
  return sigs;
}

function getFilteredClasses() {
  let data;

  if (currentView === 'mine') {
    // myClassKeys now stores courseCode|section sigs directly
    data = allClasses.filter(c => myClassKeys.has(c.courseCode + '|' + c.section));
  } else {
    data = allClasses;
  }

  if (currentDay !== 'All') data = data.filter(c => c.day === currentDay);

  if (currentQuery) {
    const q = currentQuery.toLowerCase();
    data = data.filter(c =>
      c.section.toLowerCase().includes(q)    ||
      c.teacher.toLowerCase().includes(q)    ||
      c.courseCode.toLowerCase().includes(q) ||
      c.room.toLowerCase().includes(q)
    );
  }

  return data;
}

function renderTimetable() {
  if (loadError && allClasses.length === 0) {
    resultsArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Unable to load timetable</h3>
        <p>${loadError}</p>
        <button class="btn-add-classes" onclick="location.reload()">Retry</button>
      </div>`;
    return;
  }

  const data = getFilteredClasses();

  if (data.length === 0) {
    if (allClasses.length === 0) {
      // Still loading data
      resultsArea.innerHTML = `
        <div class="loading-placeholder">
          <div class="loader-spinner" style="width:40px;height:40px;border-width:3px;margin:0 auto 1rem;"></div>
          <p style="text-align:center;color:#475569;font-size:1rem;">Loading timetable...</p>
        </div>`;
      return;
    } else {
      // No results
      resultsArea.innerHTML = emptyState(
        currentView === 'mine' ? 'No Classes Added' : 'No Results Found',
        currentView === 'mine' ? 'Start by adding your classes to see your personalized timetable' : 'Try a different search term',
        currentView === 'mine'
      );
      return;
    }
  }

  // Group by day
  const byDay = {};
  DAYS.forEach(d => byDay[d] = []);
  data.forEach(c => { if (byDay[c.day]) byDay[c.day].push(c); });

  // Sort each day by slot number (1→9)
  DAYS.forEach(d => byDay[d].sort((a,b) => (a.slot||99) - (b.slot||99) || timeToMinutes(a.time) - timeToMinutes(b.time)));

  const daysToShow = currentDay === 'All' ? DAYS : [currentDay];

  resultsArea.innerHTML = daysToShow
    .filter(d => byDay[d].length > 0)
    .map(d => `
      <div class="day-group">
        <h2 class="day-heading">${DAY_LABELS[d]}</h2>
        <div class="cards-grid">
          ${byDay[d].map(c => classCard(c)).join('')}
        </div>
      </div>
    `).join('');
}

function escKey(key) {
  return key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function classCard(c) {
  return `
    <div class="class-card">
      <div class="card-title">${c.courseCode} ${c.section}</div>
      <div class="card-body">
        <p>Location: <strong>${c.room}</strong></p>
        <p>Instructor: <strong>${c.teacher || 'TBA'}</strong></p>
        <p>Starting Slot: <strong>${c.time}</strong></p>
      </div>
    </div>`;
}

function updateCurrentDayHighlight() {
  // No yellow highlight — only user-selected day gets highlighted
}

function emptyState(title, desc, showAddBtn = false) {
  return `
    <div class="empty-state">
      <div class="empty-icon"></div>
      <h3>${title}</h3>
      <p>${desc}</p>
      ${showAddBtn ? `<button class="btn-add-classes" onclick="openModal()">＋ Add Classes</button>` : ''}
    </div>`;
}

// ─── SAVE / MY CLASSES ────────────────────────────────────────
function toggleSave(key) {
  if (myClassKeys.has(key)) myClassKeys.delete(key);
  else myClassKeys.add(key);
  saveMyClasses();
  renderTimetable();
}

function saveMyClasses() {
  localStorage.setItem('myClasses', JSON.stringify([...myClassKeys]));
}

// ─── MODAL ───────────────────────────────────────────────────
function openModal() {
  modalSelected = new Set(myClassKeys);
  renderModalList('');
  modalOverlay.classList.add('open');
  modalSearchInput.focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

function renderModalList(query) {
  let data = allClasses;
  if (query) {
    const q = query.toLowerCase();
    data = data.filter(c =>
      c.section.toLowerCase().includes(q)    ||
      c.teacher.toLowerCase().includes(q)    ||
      c.courseCode.toLowerCase().includes(q)
    );
  }

  // Group by courseCode+section (unique courses across all days)
  const courseMap = new Map(); // sig → {courseCode, section, teacher, days[], sig}
  data.forEach(c => {
    const sig = c.courseCode + '|' + c.section;
    if (!courseMap.has(sig)) {
      courseMap.set(sig, {
        sig, courseCode: c.courseCode, section: c.section,
        teacher: c.teacher, days: [], times: []
      });
    }
    const entry = courseMap.get(sig);
    if (!entry.days.includes(c.day)) entry.days.push(c.day);
    if (!entry.times.includes(c.time)) entry.times.push(c.time);
  });

  const allCourses = [...courseMap.values()].slice(0, 100);
  const myCourses  = allCourses.filter(c => modalSelected.has(c.sig));
  const otherCourses = allCourses.filter(c => !modalSelected.has(c.sig));

  let html = '';
  if (myCourses.length > 0) {
    html += `<div class="modal-section-label">⭐ My Classes</div>`;
    html += myCourses.map(c => modalItem(c)).join('');
  }
  html += otherCourses.map(c => modalItem(c)).join('');

  modalList.innerHTML = html || '<p style="text-align:center;color:var(--text3);padding:2rem;">No results</p>';
}

function modalItem(c) {
  const checked = modalSelected.has(c.sig);
  // Format days list
  const dayStr = c.days.map(d => DAY_LABELS[d]).join(', ');
  return `
    <div class="modal-item ${checked ? 'checked' : ''}" onclick="toggleModalItem('${escKey(c.sig)}')">
      <div class="modal-checkbox">${checked ? '✓' : ''}</div>
      <div>
        <div class="modal-item-text">${c.courseCode} · ${c.section}</div>
        <div class="modal-item-sub">${c.teacher || 'TBA'} · ${dayStr}</div>
      </div>
    </div>`;
}

function toggleModalItem(sig) {
  if (modalSelected.has(sig)) modalSelected.delete(sig);
  else modalSelected.add(sig);
  renderModalList(modalSearchInput.value.trim());
}

function confirmAddClasses() {
  // Save as courseCode|section signatures
  myClassKeys = new Set(modalSelected);
  saveMyClasses();
  closeModal();
  renderTimetable();
}

// ─── FREE ROOMS PAGE ─────────────────────────────────────────
function getRoomType(room) {
  const r = room.toLowerCase();
  if (r.includes('lab')) return { icon: '🔬', type: 'Lab' };
  if (r.includes('physics')) return { icon: '⚡', type: 'Physics Lab' };
  if (r.includes('power')) return { icon: '⚡', type: 'Power Lab' };
  if (r.includes('ctrl')) return { icon: '🖥️', type: 'Control Lab' };
  if (r.includes('electro')) return { icon: '⚙️', type: 'Engineering Lab' };
  return { icon: '🏫', type: 'Classroom' };
}

function getRoomCapacity(room) {
  const m = room.match(/\((\d+)\)/);
  return m ? m[1] : '—';
}

function renderFreeRooms() {
  const day  = frDaySelect.value;
  const time = frSlotSelect.value;

  const busyRooms = new Set(
    allClasses.filter(c => c.day === day && c.time === time).map(c => c.room)
  );

  const allRooms = [...new Set(allClasses.map(c => c.room))].sort();
  const freeRooms = allRooms.filter(r => !busyRooms.has(r));

  if (freeRooms.length === 0) {
    frResultsArea.innerHTML = emptyState('No Free Rooms', 'All rooms are occupied at this time');
    return;
  }

  frResultsArea.innerHTML = `
    <p style="text-align:center;color:var(--text2);margin-bottom:1.5rem;font-size:0.9rem;">
      <strong>${freeRooms.length}</strong> free rooms on <strong>${DAY_LABELS[day]}</strong> at <strong>${time}</strong>
    </p>
    <div class="cards-grid">
      ${freeRooms.map(r => {
        const {icon, type} = getRoomType(r);
        const cap = getRoomCapacity(r);
        const cleanName = r.replace(/\s*\(\d+\)\s*$/, '').trim();
        return `
        <div class="class-card free-room-card">
          <div class="free-room-icon">${icon}</div>
          <div class="card-title" style="color:var(--accent3);">${cleanName}</div>
          <div class="card-body">
            <p>Type: <strong>${type}</strong></p>
            ${cap !== '—' ? `<p>Capacity: <strong>${cap} seats</strong></p>` : ''}
            <p>Status: <strong style="color:var(--accent3);">✅ Free</strong></p>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ─── EVENT LISTENERS ─────────────────────────────────────────

// Debounce helper
function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ─── Page Switch ─────────────────────────────────────────────
function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  // Desktop nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  // Mobile page selector buttons
  document.querySelectorAll('.mob-page-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  window.scrollTo(0, 0);
}

// Desktop nav
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

// Mobile page selector
document.querySelectorAll('.mob-page-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

// Mobile theme toggle
document.getElementById('themeToggleMob')?.addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  document.getElementById('themeToggle').textContent = isDark ? '🌙' : '☀️';
  document.getElementById('themeToggleMob').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
});

// Search
searchInput.addEventListener('input', debounce(e => {
  currentQuery = e.target.value.trim();
  renderTimetable();
}));
document.getElementById('searchBtn').addEventListener('click', () => {
  currentQuery = searchInput.value.trim();
  renderTimetable();
});
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { currentQuery = searchInput.value.trim(); renderTimetable(); }
});

// View toggle
document.getElementById('btnAllClasses').addEventListener('click', () => {
  currentView = 'all';
  document.getElementById('btnAllClasses').classList.add('active');
  document.getElementById('btnMyClasses').classList.remove('active');
  addClassesWrap.style.display = 'none';
  renderTimetable();
});
document.getElementById('btnMyClasses').addEventListener('click', () => {
  currentView = 'mine';
  document.getElementById('btnMyClasses').classList.add('active');
  document.getElementById('btnAllClasses').classList.remove('active');
  addClassesWrap.style.display = 'block';
  renderTimetable();
});

// Day filter
document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDay = btn.dataset.day;
    renderTimetable();
  });
});

// Add Classes button
document.getElementById('btnAddClasses').addEventListener('click', openModal);

// Modal
document.getElementById('modalClose').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.getElementById('modalAddBtn').addEventListener('click', confirmAddClasses);
document.getElementById('modalSearchBtn').addEventListener('click', () => {
  renderModalList(modalSearchInput.value.trim());
});
modalSearchInput.addEventListener('input', debounce(e => renderModalList(e.target.value.trim())));
modalSearchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') renderModalList(modalSearchInput.value.trim());
});

// Free Rooms
document.getElementById('frSearchBtn').addEventListener('click', renderFreeRooms);

// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
themeToggle.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
});

// ─── Start ───────────────────────────────────────────────────
init();