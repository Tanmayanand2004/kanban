const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function isMember(boardId, userId) {
  return db.prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?')
    .get(boardId, userId);
}

// POST /api/tasks — create a task
router.post('/', requireAuth, (req, res) => {
  const { column_id, board_id, title, description, priority, due_date, assignee_id } = req.body;

  if (!column_id || !board_id || !title)
    return res.status(400).json({ error: 'column_id, board_id and title are required' });

  if (!isMember(board_id, req.user.id))
    return res.status(403).json({ error: 'Access denied' });

  const maxPos = db.prepare('SELECT MAX(position) AS m FROM tasks WHERE column_id = ?')
    .get(column_id).m ?? -1;

  const taskId = uuid();
  const now = new Date().toISOString();

  db.prepare(`INSERT INTO tasks
    (id, column_id, board_id, title, description, position, priority, due_date, assignee_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(taskId, column_id, board_id, title, description || null,
      maxPos + 1, priority || 'medium', due_date || null,
      assignee_id || null, req.user.id, now, now);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.status(201).json(task);
});

// PATCH /api/tasks/:id — edit a task
router.patch('/:id', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (!isMember(task.board_id, req.user.id))
    return res.status(403).json({ error: 'Access denied' });

  const { title, description, priority, due_date, assignee_id } = req.body;
  const now = new Date().toISOString();

  db.prepare(`UPDATE tasks SET
    title       = COALESCE(?, title),
    description = COALESCE(?, description),
    priority    = COALESCE(?, priority),
    due_date    = COALESCE(?, due_date),
    assignee_id = COALESCE(?, assignee_id),
    updated_at  = ?
    WHERE id = ?`)
    .run(title || null, description || null, priority || null,
      due_date || null, assignee_id || null, now, req.params.id);

  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (!isMember(task.board_id, req.user.id))
    return res.status(403).json({ error: 'Access denied' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/tasks/reorder — drag & drop
router.post('/reorder', requireAuth, (req, res) => {
  const { task_id, new_column_id, new_position, board_id } = req.body;

  if (!isMember(board_id, req.user.id))
    return res.status(403).json({ error: 'Access denied' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const reorder = db.transaction(() => {
    const oldCol = task.column_id;
    const oldPos = task.position;

    if (oldCol === new_column_id) {
      if (new_position > oldPos) {
        db.prepare(`UPDATE tasks SET position = position - 1
          WHERE column_id = ? AND position > ? AND position <= ? AND id != ?`)
          .run(oldCol, oldPos, new_position, task_id);
      } else {
        db.prepare(`UPDATE tasks SET position = position + 1
          WHERE column_id = ? AND position >= ? AND position < ? AND id != ?`)
          .run(oldCol, new_position, oldPos, task_id);
      }
    } else {
      db.prepare('UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?')
        .run(oldCol, oldPos);
      db.prepare('UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?')
        .run(new_column_id, new_position);
    }

    db.prepare('UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?')
      .run(new_column_id, new_position, new Date().toISOString(), task_id);
  });

  reorder();
  res.json({ ok: true });
});

module.exports = router;