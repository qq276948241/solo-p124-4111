const express = require('express');
const db = require('../database/db');
const { authMiddleware, patientMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/feedbacks', authMiddleware, patientMiddleware, (req, res) => {
  const patientId = req.user.id;
  const { appointment_id, rating, comment } = req.body;

  if (!appointment_id || !rating) {
    return res.status(400).json({ message: '预约ID和评分不能为空' });
  }

  const ratingNum = parseInt(rating);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ message: '评分必须是1到5之间的整数' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.get(
      'SELECT * FROM appointments WHERE id = ? AND patient_id = ?',
      [appointment_id, patientId],
      (err, appointment) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ message: '服务器错误' });
        }
        if (!appointment) {
          db.run('ROLLBACK');
          return res.status(400).json({ message: '预约不存在或不属于您' });
        }
        if (appointment.status !== 'completed') {
          db.run('ROLLBACK');
          return res.status(400).json({ message: '预约尚未完成，暂不能评价' });
        }

        db.get(
          'SELECT id FROM feedbacks WHERE appointment_id = ?',
          [appointment_id],
          (err, existing) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ message: '服务器错误' });
            }
            if (existing) {
              db.run('ROLLBACK');
              return res.status(400).json({ message: '该预约已评价，不能重复提交' });
            }

            db.run(
              'INSERT INTO feedbacks (patient_id, doctor_id, appointment_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
              [patientId, appointment.doctor_id, appointment_id, ratingNum, comment || null],
              function (err) {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ message: '服务器错误' });
                }

                db.get(
                  `SELECT 
                     AVG(rating) as avg_rating,
                     COUNT(*) as rating_count
                   FROM feedbacks WHERE doctor_id = ?`,
                  [appointment.doctor_id],
                  (err, stats) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return res.status(500).json({ message: '服务器错误' });
                    }

                    const newAvg = Math.round(stats.avg_rating * 10) / 10;
                    const newCount = stats.rating_count;

                    db.run(
                      'UPDATE doctors SET avg_rating = ?, rating_count = ? WHERE id = ?',
                      [newAvg, newCount, appointment.doctor_id],
                      (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          return res.status(500).json({ message: '服务器错误' });
                        }

                        db.run('COMMIT', (commitErr) => {
                          if (commitErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ message: '服务器错误' });
                          }

                          res.status(201).json({
                            id: this.lastID,
                            patient_id: patientId,
                            doctor_id: appointment.doctor_id,
                            appointment_id: parseInt(appointment_id),
                            rating: ratingNum,
                            comment: comment || null,
                            doctor_avg_rating: newAvg,
                            doctor_rating_count: newCount,
                            message: '评价提交成功'
                          });
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

router.get('/feedbacks/doctor/:doctor_id', authMiddleware, (req, res) => {
  const { doctor_id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const page_size = parseInt(req.query.page_size) || 10;

  if (page < 1) {
    return res.status(400).json({ message: '页码不能小于1' });
  }
  if (page_size < 1 || page_size > 100) {
    return res.status(400).json({ message: '每页条数必须在1到100之间' });
  }

  const offset = (page - 1) * page_size;

  db.get('SELECT id FROM doctors WHERE id = ?', [doctor_id], (err, doctor) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!doctor) {
      return res.status(404).json({ message: '医生不存在' });
    }

    const countSql = `
      SELECT COUNT(*) as total FROM feedbacks WHERE doctor_id = ?
    `;
    db.get(countSql, [doctor_id], (err, countResult) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }

      const total = countResult.total;
      const total_pages = Math.ceil(total / page_size);

      const listSql = `
        SELECT 
          f.id,
          f.rating,
          f.comment,
          f.created_at,
          f.patient_id,
          u.name as patient_name
        FROM feedbacks f
        LEFT JOIN users u ON f.patient_id = u.id
        WHERE f.doctor_id = ?
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `;

      db.all(listSql, [doctor_id, page_size, offset], (err, rows) => {
        if (err) {
          return res.status(500).json({ message: '服务器错误' });
        }

        db.get(
          'SELECT avg_rating, rating_count FROM doctors WHERE id = ?',
          [doctor_id],
          (err, docStats) => {
            if (err) {
              return res.status(500).json({ message: '服务器错误' });
            }

            res.json({
              doctor_id: parseInt(doctor_id),
              avg_rating: docStats ? docStats.avg_rating : 0,
              rating_count: docStats ? docStats.rating_count : 0,
              pagination: {
                page,
                page_size,
                total,
                total_pages
              },
              list: rows
            });
          }
        );
      });
    });
  });
});

router.get('/feedbacks/my', authMiddleware, patientMiddleware, (req, res) => {
  const patientId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const page_size = parseInt(req.query.page_size) || 10;

  if (page < 1) {
    return res.status(400).json({ message: '页码不能小于1' });
  }
  if (page_size < 1 || page_size > 100) {
    return res.status(400).json({ message: '每页条数必须在1到100之间' });
  }

  const offset = (page - 1) * page_size;

  db.get(
    'SELECT COUNT(*) as total FROM feedbacks WHERE patient_id = ?',
    [patientId],
    (err, countResult) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }

      const total = countResult.total;
      const total_pages = Math.ceil(total / page_size);

      const listSql = `
        SELECT 
          f.id,
          f.rating,
          f.comment,
          f.created_at,
          f.doctor_id,
          f.appointment_id,
          d.name as doctor_name,
          d.title as doctor_title,
          dept.name as department_name,
          a.appointment_date
        FROM feedbacks f
        LEFT JOIN doctors d ON f.doctor_id = d.id
        LEFT JOIN departments dept ON d.department_id = dept.id
        LEFT JOIN appointments a ON f.appointment_id = a.id
        WHERE f.patient_id = ?
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `;

      db.all(listSql, [patientId, page_size, offset], (err, rows) => {
        if (err) {
          return res.status(500).json({ message: '服务器错误' });
        }

        res.json({
          pagination: {
            page,
            page_size,
            total,
            total_pages
          },
          list: rows
        });
      });
    }
  );
});

module.exports = router;
