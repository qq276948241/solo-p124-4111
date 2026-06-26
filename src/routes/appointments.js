const express = require('express');
const db = require('../database/db');
const { authMiddleware, patientMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

function getDayOfWeek(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function isValidDate(dateStr) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
}

router.get('/appointments/available', authMiddleware, (req, res) => {
  const { department_id, date } = req.query;

  if (!department_id || !date) {
    return res.status(400).json({ message: '科室ID和日期不能为空' });
  }

  if (!isValidDate(date)) {
    return res.status(400).json({ message: '日期格式错误，应为YYYY-MM-DD' });
  }

  const targetDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (targetDate < today) {
    return res.status(400).json({ message: '不能查询过去日期的号源' });
  }

  const dayOfWeek = getDayOfWeek(date);

  const sql = `
    SELECT 
      d.id as doctor_id,
      d.name as doctor_name,
      d.title,
      d.description,
      dept.name as department_name,
      s.max_slots,
      s.day_of_week,
      COALESCE(ap.booked_count, 0) as booked_count,
      (s.max_slots - COALESCE(ap.booked_count, 0)) as available_slots
    FROM doctors d
    INNER JOIN departments dept ON d.department_id = dept.id
    INNER JOIN schedules s ON d.id = s.doctor_id
    LEFT JOIN (
      SELECT doctor_id, COUNT(*) as booked_count
      FROM appointments
      WHERE appointment_date = ? AND status = 'booked'
      GROUP BY doctor_id
    ) ap ON d.id = ap.doctor_id
    WHERE dept.id = ? AND s.day_of_week = ?
    ORDER BY available_slots DESC, d.id
  `;

  db.all(sql, [date, department_id, dayOfWeek], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }

    const result = rows.map(row => ({
      ...row,
      available: row.available_slots > 0
    }));

    res.json({
      date,
      department_id: parseInt(department_id),
      doctors: result
    });
  });
});

router.get('/appointments/my', authMiddleware, patientMiddleware, (req, res) => {
  const patientId = req.user.id;
  const { status } = req.query;

  let sql = `
    SELECT 
      a.id,
      a.appointment_date,
      a.status,
      a.created_at,
      d.id as doctor_id,
      d.name as doctor_name,
      d.title,
      dept.name as department_name
    FROM appointments a
    INNER JOIN doctors d ON a.doctor_id = d.id
    INNER JOIN departments dept ON d.department_id = dept.id
    WHERE a.patient_id = ?
  `;
  const params = [patientId];

  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY a.appointment_date DESC, a.created_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(rows);
  });
});

router.post('/appointments', authMiddleware, patientMiddleware, (req, res) => {
  const patientId = req.user.id;
  const { doctor_id, date } = req.body;

  if (!doctor_id || !date) {
    return res.status(400).json({ message: '医生ID和日期不能为空' });
  }

  if (!isValidDate(date)) {
    return res.status(400).json({ message: '日期格式错误，应为YYYY-MM-DD' });
  }

  const targetDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (targetDate < today) {
    return res.status(400).json({ message: '不能预约过去日期的号源' });
  }

  const dayOfWeek = getDayOfWeek(date);

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.get('SELECT * FROM doctors WHERE id = ?', [doctor_id], (err, doctor) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ message: '服务器错误' });
      }
      if (!doctor) {
        db.run('ROLLBACK');
        return res.status(400).json({ message: '医生不存在' });
      }

      db.get(
        'SELECT * FROM schedules WHERE doctor_id = ? AND day_of_week = ?',
        [doctor_id, dayOfWeek],
        (err, schedule) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: '服务器错误' });
          }
          if (!schedule) {
            db.run('ROLLBACK');
            return res.status(400).json({ message: '该医生此日期不坐诊' });
          }

          db.get(
            'SELECT COUNT(*) as booked_count FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status = ?',
            [doctor_id, date, 'booked'],
            (err, result) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ message: '服务器错误' });
              }

              const bookedCount = result.booked_count;
              if (bookedCount >= schedule.max_slots) {
                db.run('ROLLBACK');
                return res.status(400).json({
                  message: '号源已满',
                  detail: `该医生${date}的号源已约满（共${schedule.max_slots}个号）`,
                  available: false
                });
              }

              db.get(
                'SELECT * FROM appointments WHERE patient_id = ? AND doctor_id = ? AND appointment_date = ? AND status = ?',
                [patientId, doctor_id, date, 'booked'],
                (err, existingAppt) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: '服务器错误' });
                  }
                  if (existingAppt) {
                    db.run('ROLLBACK');
                    return res.status(400).json({ message: '您已预约该医生此日期的号源，无需重复预约' });
                  }

                  db.run(
                    'INSERT INTO appointments (patient_id, doctor_id, appointment_date, status) VALUES (?, ?, ?, ?)',
                    [patientId, doctor_id, date, 'booked'],
                    function (err) {
                      if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ message: '服务器错误' });
                      }

                      db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                          db.run('ROLLBACK');
                          return res.status(500).json({ message: '服务器错误' });
                        }

                        const remaining = schedule.max_slots - bookedCount - 1;
                        res.status(201).json({
                          id: this.lastID,
                          patient_id: patientId,
                          doctor_id: parseInt(doctor_id),
                          doctor_name: doctor.name,
                          appointment_date: date,
                          status: 'booked',
                          remaining_slots: remaining,
                          message: '预约成功'
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
    });
  });
});

router.post('/appointments/:id/complete', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;

  db.get(
    'SELECT * FROM appointments WHERE id = ?',
    [id],
    (err, appointment) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }
      if (!appointment) {
        return res.status(404).json({ message: '预约不存在' });
      }
      if (appointment.status === 'cancelled') {
        return res.status(400).json({ message: '已取消的预约不能标记为已完成' });
      }
      if (appointment.status === 'completed') {
        return res.status(400).json({ message: '该预约已完成，无需重复操作' });
      }

      const targetDate = new Date(appointment.appointment_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (targetDate > today) {
        return res.status(400).json({ message: '不能标记未来日期的预约为已完成' });
      }

      db.run(
        "UPDATE appointments SET status = 'completed' WHERE id = ?",
        [id],
        function (err) {
          if (err) {
            return res.status(500).json({ message: '服务器错误' });
          }
          res.json({
            id: parseInt(id),
            status: 'completed',
            message: '预约已标记为完成，患者可进行评价'
          });
        }
      );
    }
  );
});

router.post('/appointments/:id/cancel', authMiddleware, patientMiddleware, (req, res) => {
  const patientId = req.user.id;
  const { id } = req.params;

  db.get(
    'SELECT * FROM appointments WHERE id = ? AND patient_id = ?',
    [id, patientId],
    (err, appointment) => {
      if (err) {
        return res.status(500).json({ message: '服务器错误' });
      }
      if (!appointment) {
        return res.status(404).json({ message: '预约不存在' });
      }
      if (appointment.status === 'cancelled') {
        return res.status(400).json({ message: '该预约已取消，无需重复操作' });
      }

      const targetDate = new Date(appointment.appointment_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (targetDate < today) {
        return res.status(400).json({ message: '不能取消过去日期的预约' });
      }

      db.run(
        "UPDATE appointments SET status = 'cancelled' WHERE id = ?",
        [id],
        function (err) {
          if (err) {
            return res.status(500).json({ message: '服务器错误' });
          }
          res.json({
            id: parseInt(id),
            status: 'cancelled',
            message: '预约已取消，号源已释放'
          });
        }
      );
    }
  );
});

module.exports = router;
