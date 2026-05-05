// ─── API Client ───────────────────────────────────────────────────────────────

const API = (() => {
  const BASE = '/api';
  function getToken() { return localStorage.getItem('token'); }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(BASE + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  return {
    get:    (path)       => request('GET',    path),
    post:   (path, body) => request('POST',   path, body),
    patch:  (path, body) => request('PATCH',  path, body),
    delete: (path)       => request('DELETE', path),
  };
})();

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  boards: [],
  currentBoard: null,
  filterPriority: '',
  filterSearch: '',
};

// ─── Session ──────────────────────────────────────────────────────────────────

function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  state.user = user;
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  state.user = null;
}

function loadSession() {
  const token = localStorage.getItem('token');
  const user  = localStorage.getItem('user');
  if (token && user) { state.user = JSON.parse(user); return true; }
  return false;
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadBoards();
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
  });
});

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const { token, user } = await API.post('/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });
    saveSession(token, user);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('reg-error');
  errEl.classList.add('hidden');
  try {
    const { token, user } = await API.post('/auth/register', {
      name: document.getElementById('reg-name').value,
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value,
    });
    saveSession(token, user);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  showAuth();
});

// ─── Boards sidebar ───────────────────────────────────────────────────────────

async function loadBoards() {
  state.boards = await API.get('/boards');
  renderBoardsNav();
  renderUserChip();
  if (state.boards.length > 0) selectBoard(state.boards[0].id);
}

function renderUserChip() {
  const chip = document.getElementById('user-chip');
  if (!state.user) return;
  chip.innerHTML = `
    <div class="avatar">${state.user.avatar || state.user.name[0]}</div>
    <span>${state.user.name}</span>`;
}

function renderBoardsNav() {
  const nav = document.getElementById('boards-nav');
  nav.innerHTML = '';
  state.boards.forEach(board => {
    const item = document.createElement('div');
    item.className = 'board-nav-item' + (state.currentBoard?.id === board.id ? ' active' : '');
    item.textContent = board.name;
    item.addEventListener('click', () => selectBoard(board.id));
    nav.appendChild(item);
  });
}

async function selectBoard(boardId) {
  state.currentBoard = await API.get(`/boards/${boardId}`);
  state.filterPriority = '';
  state.filterSearch = '';
  document.getElementById('filter-priority').value = '';
  document.getElementById('filter-search').value = '';
  document.getElementById('board-header').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('board-name').textContent = state.currentBoard.name;
  renderBoardsNav();
  renderBoard();
  populateTaskModal();
}

// ─── New board ────────────────────────────────────────────────────────────────

document.getElementById('new-board-btn').addEventListener('click', () => {
  document.getElementById('board-modal').classList.remove('hidden');
  document.getElementById('b-name').focus();
});
document.getElementById('board-modal-close').addEventListener('click', () =>
  document.getElementById('board-modal').classList.add('hidden'));
document.getElementById('board-modal-cancel').addEventListener('click', () =>
  document.getElementById('board-modal').classList.add('hidden'));

document.getElementById('board-modal-save').addEventListener('click', async () => {
  const name = document.getElementById('b-name').value.trim();
  if (!name) return;
  const board = await API.post('/boards', {
    name,
    description: document.getElementById('b-desc').value.trim() || undefined,
  });
  document.getElementById('board-modal').classList.add('hidden');
  document.getElementById('b-name').value = '';
  document.getElementById('b-desc').value = '';
  await loadBoards();
  selectBoard(board.id);
});

// ─── Board rendering ──────────────────────────────────────────────────────────

function getFilteredTasks(colId) {
  return state.currentBoard.tasks.filter(t => {
    if (t.column_id !== colId) return false;
    if (state.filterPriority && t.priority !== state.filterPriority) return false;
    if (state.filterSearch && !t.title.toLowerCase().includes(state.filterSearch.toLowerCase())) return false;
    return true;
  });
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  state.currentBoard.columns.forEach(col => {
    boardEl.appendChild(createColumnEl(col));
  });
}

function createColumnEl(col) {
  const el = document.createElement('div');
  el.className = 'column';
  el.dataset.colId = col.id;

  const tasks = getFilteredTasks(col.id);

  el.innerHTML = `
    <div class="col-header">
      <div class="col-title-row">
        <span class="col-dot" style="background:${col.color}"></span>
        <span class="col-title">${col.name}</span>
        <span class="col-count">${tasks.length}</span>
      </div>
    </div>
    <div class="cards-list" data-col-id="${col.id}"></div>
    <button class="col-add-btn" data-col-id="${col.id}">+ Add task</button>`;

  const list = el.querySelector('.cards-list');
  tasks.forEach(task => list.appendChild(createCardEl(task)));

  el.querySelector('.col-add-btn').addEventListener('click', () => openTaskModal(null, col.id));
  setupDropTarget(el, list, col.id);
  return el;
}

function formatDue(dueDate) {
  if (!dueDate) return '';
  const due  = new Date(dueDate + 'T00:00:00');
  const diff = Math.ceil((due - new Date()) / 86400000);
  const str  = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const cls  = diff < 0 ? 'overdue' : diff <= 3 ? 'soon' : '';
  return `<span class="due-badge ${cls}">📅 ${str}</span>`;
}

function createCardEl(task) {
  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = true;
  el.dataset.taskId = task.id;

  el.innerHTML = `
    <div class="card-actions">
      <button class="card-btn edit-btn">✎</button>
      <button class="card-btn delete-btn">✕</button>
    </div>
    <div class="card-title">${task.title}</div>
    <div class="card-footer">
      <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      ${formatDue(task.due_date)}
    </div>`;

  el.querySelector('.edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    openTaskModal(task);
  });
  el.querySelector('.delete-btn').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${task.title}"?`)) return;
    await API.delete(`/tasks/${task.id}`);
    state.currentBoard.tasks = state.currentBoard.tasks.filter(t => t.id !== task.id);
    renderBoard();
  });

  setupDragSource(el, task);
  return el;
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

let dragState   = null;
let placeholder = null;

function setupDragSource(cardEl, task) {
  cardEl.addEventListener('dragstart', e => {
    dragState = { taskId: task.id, sourceColId: task.column_id };
    e.dataTransfer.effectAllowed = 'move';
    placeholder = document.createElement('div');
    placeholder.className = 'card drag-placeholder';
    placeholder.style.height = cardEl.offsetHeight + 'px';
    setTimeout(() => cardEl.classList.add('dragging'), 0);
  });

  cardEl.addEventListener('dragend', () => {
    cardEl.classList.remove('dragging');
    placeholder?.remove();
    document.querySelectorAll('.column.drag-over').forEach(c => c.classList.remove('drag-over'));
    dragState = null;
    placeholder = null;
  });
}

function setupDropTarget(colEl, listEl, colId) {
  colEl.addEventListener('dragover', e => {
    e.preventDefault();
    colEl.classList.add('drag-over');
    const after = getDragAfterElement(listEl, e.clientY);
    after ? listEl.insertBefore(placeholder, after) : listEl.appendChild(placeholder);
  });

  colEl.addEventListener('dragleave', e => {
    if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('drag-over');
  });

  colEl.addEventListener('drop', async e => {
    e.preventDefault();
    colEl.classList.remove('drag-over');
    if (!dragState) return;

    const cards  = [...listEl.querySelectorAll('.card:not(.dragging)')];
    const phIdx  = [...listEl.children].indexOf(placeholder);
    const newPos = phIdx === -1 ? cards.length : phIdx;

    await API.post('/tasks/reorder', {
      task_id: dragState.taskId,
      new_column_id: colId,
      new_position: newPos,
      board_id: state.currentBoard.id,
    });

    state.currentBoard = await API.get(`/boards/${state.currentBoard.id}`);
    renderBoard();
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.card:not(.dragging):not(.drag-placeholder)')];
  return els.reduce((closest, child) => {
    const rect   = child.getBoundingClientRect();
    const offset = y - rect.top - rect.height / 2;
    return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

document.getElementById('filter-priority').addEventListener('change', e => {
  state.filterPriority = e.target.value;
  renderBoard();
});

document.getElementById('filter-search').addEventListener('input', e => {
  state.filterSearch = e.target.value.trim();
  renderBoard();
});

// ─── Task Modal ───────────────────────────────────────────────────────────────

let editingTaskId = null;

function populateTaskModal() {
  const colSelect      = document.getElementById('t-column');
  const assigneeSelect = document.getElementById('t-assignee');

  colSelect.innerHTML = state.currentBoard.columns.map(c =>
    `<option value="${c.id}">${c.name}</option>`).join('');

  assigneeSelect.innerHTML = '<option value="">Unassigned</option>' +
    state.currentBoard.members.map(m =>
      `<option value="${m.id}">${m.name}</option>`).join('');
}

function openTaskModal(task = null, colId = null) {
  editingTaskId = task?.id || null;
  document.getElementById('task-modal-title').textContent = task ? 'Edit task' : 'Add task';
  document.getElementById('t-title').value    = task?.title       || '';
  document.getElementById('t-desc').value     = task?.description || '';
  document.getElementById('t-priority').value = task?.priority    || 'medium';
  document.getElementById('t-due').value      = task?.due_date    || '';
  document.getElementById('t-assignee').value = task?.assignee_id || '';
  document.getElementById('t-column').value   = colId || task?.column_id || state.currentBoard.columns[0].id;
  document.getElementById('task-modal').classList.remove('hidden');
  document.getElementById('t-title').focus();
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
  editingTaskId = null;
}

document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
document.getElementById('task-modal-cancel').addEventListener('click', closeTaskModal);
document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());

document.getElementById('task-modal-save').addEventListener('click', async () => {
  const title = document.getElementById('t-title').value.trim();
  if (!title) { document.getElementById('t-title').focus(); return; }

  const payload = {
    title,
    description: document.getElementById('t-desc').value.trim()  || undefined,
    priority:    document.getElementById('t-priority').value,
    due_date:    document.getElementById('t-due').value           || undefined,
    assignee_id: document.getElementById('t-assignee').value      || undefined,
    column_id:   document.getElementById('t-column').value,
    board_id:    state.currentBoard.id,
  };

  if (editingTaskId) {
    const updated = await API.patch(`/tasks/${editingTaskId}`, payload);
    state.currentBoard.tasks = state.currentBoard.tasks.map(t =>
      t.id === editingTaskId ? updated : t);
  } else {
    const newTask = await API.post('/tasks', payload);
    state.currentBoard.tasks.push(newTask);
  }

  closeTaskModal();
  renderBoard();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeTaskModal();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (loadSession()) {
  showApp();
} else {
  showAuth();
}