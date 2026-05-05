const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function isMember(boardId, userId) {
  return db.prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, userId);
}

// GET /api/boards — all boards for current user
router.get('/', requireAuth, (req, res) => {
  const boards = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM tasks WHERE board_id = b.id) AS task_count
    FROM boards b
    JOIN board_members bm ON bm.board_id = b.id
    WHERE bm.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json(boards);
});

// POST /api/boards — create a board
router.post('/', requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Board name is required' });

  const boardId = uuid();

  db.prepare('INSERT INTO boards (id, name, description, owner_id) VALUES (?, ?, ?, ?)')
    .run(boardId, name, description || null, req.user.id);

  // Add creator as owner
  db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)')
    .run(boardId, req.user.id, 'owner');

  // Create default columns
  const defaults = ['Backlog', 'In Progress', 'Review', 'Done'];
  const colors   = ['#94a3b8', '#f59e0b', '#6366f1', '#22c55e'];
  defaults.forEach((name, i) => {
    db.prepare('INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)')
      .run(uuid(), boardId, name, i, colors[i]);
  });

  res.status(201).json(db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId));
});

// GET /api/boards/:id — full board with columns, tasks, members
router.get('/:id', requireAuth, (req, res) => {
  if (!isMember(req.params.id, req.user.id))
    return res.status(403).json({ error: 'Access denied' });

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const columns = db.prepare(
    'SELECT * FROM columns WHERE board_id = ? ORDER BY position'
  ).all(req.params.id);

  const tasks = db.prepare(`
    SELECT t.*, u.name AS assignee_name, u.avatar AS assignee_avatar
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.board_id = ?
    ORDER BY t.position
  `).all(req.params.id);

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, bm.role
    FROM board_members bm
    JOIN users u ON u.id = bm.user_id
    WHERE bm.board_id = ?
  `).all(req.params.id);

  const labels = db.prepare('SELECT * FROM labels WHERE board_id = ?').all(req.params.id);

  res.json({ ...board, columns, tasks, members, labels });
});

// DELETE /api/boards/:id
router.delete('/:id', requireAuth, (req, res) => {
  const m = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!m || m.role !== 'owner')
    return res.status(403).json({ error: 'Only the owner can delete this board' });

  db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/boards/:id/columns — add a column
router.post('/:id/columns', requireAuth, (req, res) => {
  if (!isMember(req.params.id, req.user.id))
    return res.status(403).json({ error: 'Access denied' });

  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Column name is required' });

  const maxPos = db.prepare('SELECT MAX(position) AS m FROM columns WHERE board_id = ?')
    .get(req.params.id).m ?? -1;

  const colId = uuid();
  db.prepare('INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)')
    .run(colId, req.params.id, name, maxPos + 1, color || '#6366f1');

  res.status(201).json(db.prepare('SELECT * FROM columns WHERE id = ?').get(colId));
});

module.exports = router;