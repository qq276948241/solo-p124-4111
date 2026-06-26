const express = require('express');
const db = require('../database/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

function getDayOfWeek(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

router.get('/schedules', authMiddleware, (req, res) => {
  const { doctor_id } = req.query;
  let sql = `SELECT s.*, d.name as doctor_name, dept.name as department_name 
             FROM schedules s 
             LEFT JOIN doctors d ON s.doctor_id = d.id 
             LEFT JOIN departments dept ON d.department_id = dept.id`;
  const params = [];

  if (doctor_id) {
    sql += ' WHERE s.doctor_id = ?';
    params.push(doctor_id);
  }
  sql += ' ORDER BY s.doctor_id, s.day_of_week';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(rows);
  });
});

router.get('/schedules/doctor/:doctor_id', authMiddleware, (req, res) => {
  const { doctor_id } = req.params;
  db.all(
    'SELECT * FROM schedules WHERE doctor_id = ? ORDER BY day_of_week',
    [doctor_id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }
      res.json(rows);
    }
  );
});

router.post('/schedules', authMiddleware, adminMiddleware, (req, res) => {
  const { doctor_id, day_of_week, max_slots } = req.body;

  if (!doctor_id || !day_of_week) {
    return res.status(400).json({ message: '医生ID和星期不能为空' });
  }

  if (day_of_week < 1 || day_of_week > 7) {
    return res.status(400).json({ message: '星期必须在1-7之间（1=周一，7=周日）' });
  }

  if (max_slots !== undefined && (max_slots < 1 || max_slots > 200)) {
    return res.status(400).json({ message: '号源数必须在1-200之间' });
  }

  db.get('SELECT id FROM doctors WHERE id = ?', [doctor_id], (err, doctor) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!doctor) {
      return res.status(400).json({ message: '医生不存在' });
    }

    const slots = max_slots || 20;

    db.run(
      'INSERT OR REPLACE INTO schedules (doctor_id, day_of_week, max_slots) VALUES (?, ?, ?)',
      [doctor_id, day_of_week, slots],
      function (err) {
        if (err) {
          return res.status(500).json({ message: '服务器错误' });
        }
        res.status(201).json({
          id: this.lastID,
          doctor_id: parseInt(doctor_id),
          day_of_week: parseInt(day_of_week),
          max_slots: slots
        });
      }
    );
  });
});

router.put('/schedules/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { day_of_week, max_slots } = req.body;

  db.get('SELECT * FROM schedules WHERE id = ?', [id], (err, schedule) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!schedule) {
      return res.status(404).json({ message: '排班不存在' });
    }

    const newDay = day_of_week !== undefined ? day_of_week : schedule.day_of_week;
    const newSlots = max_slots !== undefined ? max_slots : schedule.max_slots;

    if (newDay < 1 || newDay > 7) {
      return res.status(400).json({ message: '星期必须在1-7之间（1=周一，7=周日）' });
    }

    if (newSlots < 1 || newSlots > 200) {
      return res.status(400).json({ message: '号源数必须在1-200之间' });
    }

    db.run(
      'UPDATE schedules SET day_of_week = ?, max_slots = ? WHERE id = ?',
      [newDay, newSlots, id],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ message: '该医生此星期已有排班' });
          }
          return res.status(500).json({ message: '服务器错误' });
        }
        res.json({
          id: parseInt(id),
          doctor_id: schedule.doctor_id,
          day_of_week: newDay,
          max_slots: newSlots
        });
      }
    );
  });
});

router.delete('/schedules/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM schedules WHERE id = ?', [id], (err, schedule) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!schedule) {
      return res.status(404).json({ message: '排班不存在' });
    }

    db.run('DELETE FROM schedules WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }
      res.json({ message: '排班已删除' });
    });
  });
});

module.exports = router;
