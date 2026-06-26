const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'clinic.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("PRAGMA table_info(doctors)", (err, cols) => {
    if (err) {
      console.error('检查表结构失败:', err.message);
      return finish();
    }
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('avg_rating')) {
      db.run('ALTER TABLE doctors ADD COLUMN avg_rating REAL DEFAULT 0', (err) => {
        if (err) console.log('avg_rating列可能已存在:', err.message);
        else console.log('已添加 doctors.avg_rating 字段');
      });
    }
    if (!colNames.includes('rating_count')) {
      db.run('ALTER TABLE doctors ADD COLUMN rating_count INTEGER DEFAULT 0', (err) => {
        if (err) console.log('rating_count列可能已存在:', err.message);
        else console.log('已添加 doctors.rating_count 字段');
      });
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    appointment_id INTEGER NOT NULL UNIQUE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  )`, (err) => {
    if (err) console.log('创建feedbacks表失败:', err.message);
    else console.log('已创建 feedbacks 表');
  });

  db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='appointments'", (err, rows) => {
    if (err) {
      console.error('查询appointments表结构失败:', err.message);
    } else if (rows.length > 0) {
      const sql = rows[0].sql;
      if (!sql.includes("'completed'")) {
        console.log('检测到旧版appointments表，需要重建以支持completed状态...');
        migrateAppointments();
      } else {
        console.log('appointments表已包含completed状态，无需重建');
      }
    }
  });
});

function migrateAppointments() {
  db.run(`CREATE TABLE IF NOT EXISTS appointments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    appointment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked', 'cancelled', 'completed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`, (err) => {
    if (err) {
      console.error('创建appointments_new失败:', err.message);
      return setTimeout(finish, 500);
    }
    db.run(`INSERT INTO appointments_new (id, patient_id, doctor_id, appointment_date, status, created_at)
            SELECT id, patient_id, doctor_id, appointment_date, status, created_at FROM appointments`, (err) => {
      if (err) {
        console.error('迁移数据失败:', err.message);
        return setTimeout(finish, 500);
      }
      db.run('DROP TABLE appointments', (err) => {
        if (err) console.error('删除旧表失败:', err.message);
        db.run('ALTER TABLE appointments_new RENAME TO appointments', (err) => {
          if (err) console.error('重命名表失败:', err.message);
          else console.log('appointments表迁移完成，已支持completed状态');
          setTimeout(finish, 500);
        });
      });
    });
  });
}

function finish() {
  db.close();
  console.log('数据库升级完成！');
}

