const express = require('express');
const db = require('../database/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/departments', authMiddleware, (req, res) => {
  db.all('SELECT * FROM departments ORDER BY id', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(rows);
  });
});

router.get('/doctors', authMiddleware, (req, res) => {
  const { department_id } = req.query;
  let sql = `SELECT d.*, dept.name as department_name 
             FROM doctors d 
             LEFT JOIN departments dept ON d.department_id = dept.id`;
  const params = [];

  if (department_id) {
    sql += ' WHERE d.department_id = ?';
    params.push(department_id);
  }
  sql += ' ORDER BY d.id';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(rows);
  });
});

router.get('/doctors/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.get(
    `SELECT d.*, dept.name as department_name 
     FROM doctors d 
     LEFT JOIN departments dept ON d.department_id = dept.id 
     WHERE d.id = ?`,
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }
      if (!row) {
        return res.status(404).json({ message: '医生不存在' });
      }
      res.json(row);
    }
  );
});

router.post('/doctors', authMiddleware, adminMiddleware, (req, res) => {
  const { name, department_id, title, description } = req.body;

  if (!name || !department_id) {
    return res.status(400).json({ message: '医生姓名和科室不能为空' });
  }

  db.get('SELECT id FROM departments WHERE id = ?', [department_id], (err, dept) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!dept) {
      return res.status(400).json({ message: '科室不存在' });
    }

    db.run(
      'INSERT INTO doctors (name, department_id, title, description) VALUES (?, ?, ?, ?)',
      [name, department_id, title || null, description || null],
      function (err) {
        if (err) {
          return res.status(500).json({ message: '服务器错误' });
        }
        res.status(201).json({
          id: this.lastID,
          name,
          department_id,
          title: title || null,
          description: description || null
        });
      }
    );
  });
});

router.put('/doctors/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, department_id, title, description } = req.body;

  db.get('SELECT * FROM doctors WHERE id = ?', [id], (err, doctor) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!doctor) {
      return res.status(404).json({ message: '医生不存在' });
    }

    const newName = name || doctor.name;
    const newDeptId = department_id || doctor.department_id;
    const newTitle = title !== undefined ? title : doctor.title;
    const newDesc = description !== undefined ? description : doctor.description;

    if (department_id) {
      db.get('SELECT id FROM departments WHERE id = ?', [department_id], (err, dept) => {
        if (err) {
          return res.status(500).json({ message: '服务器错误' });
        }
        if (!dept) {
          return res.status(400).json({ message: '科室不存在' });
        }
        updateDoctor();
      });
    } else {
      updateDoctor();
    }

    function updateDoctor() {
      db.run(
        'UPDATE doctors SET name = ?, department_id = ?, title = ?, description = ? WHERE id = ?',
        [newName, newDeptId, newTitle, newDesc, id],
        function (err) {
          if (err) {
            return res.status(500).json({ message: '服务器错误' });
          }
          res.json({
            id: parseInt(id),
            name: newName,
            department_id: newDeptId,
            title: newTitle,
            description: newDesc
          });
        }
      );
    }
  });
});

router.delete('/doctors/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM doctors WHERE id = ?', [id], (err, doctor) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!doctor) {
      return res.status(404).json({ message: '医生不存在' });
    }

    db.get('SELECT COUNT(*) as count FROM appointments WHERE doctor_id = ? AND status = ?', [id, 'booked'], (err, result) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }
      if (result.count > 0) {
        return res.status(400).json({ message: '该医生存在未完成的预约，无法删除' });
      }

      db.run('DELETE FROM schedules WHERE doctor_id = ?', [id], (err) => {
        if (err) {
          return res.status(500).json({ message: '服务器错误' });
        }
        db.run('DELETE FROM doctors WHERE id = ?', [id], (err) => {
          if (err) {
            return res.status(500).json({ message: '服务器错误' });
          }
          res.json({ message: '医生已删除' });
        });
      });
    });
  });
});

module.exports = router;
