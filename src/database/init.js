const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'clinic.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'patient')),
    name TEXT NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department_id INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
    max_slots INTEGER NOT NULL DEFAULT 20,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doctor_id, day_of_week),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    appointment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES users(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  )`);

  const adminPassword = bcrypt.hashSync('admin123', 10);
  const patientPassword = bcrypt.hashSync('patient123', 10);

  db.run(`INSERT OR IGNORE INTO users (username, password, role, name, phone) VALUES 
    ('admin', ?, 'admin', '系统管理员', '13800000000'),
    ('patient1', ?, 'patient', '张三', '13800000001'),
    ('patient2', ?, 'patient', '李四', '13800000002')`,
    [adminPassword, patientPassword, patientPassword]
  );

  db.run(`INSERT OR IGNORE INTO departments (name, description) VALUES 
    ('内科', '内科疾病诊疗'),
    ('外科', '外科疾病诊疗'),
    ('儿科', '儿童疾病诊疗'),
    ('妇科', '妇科疾病诊疗')`
  );

  db.run(`INSERT OR IGNORE INTO doctors (name, department_id, title, description) VALUES 
    ('王医生', 1, '主任医师', '擅长心血管疾病'),
    ('李医生', 1, '副主任医师', '擅长呼吸系统疾病'),
    ('张医生', 2, '主治医师', '普外科手术'),
    ('赵医生', 3, '主治医师', '儿童常见病'),
    ('刘医生', 4, '主任医师', '妇产科疑难杂症')`
  );

  db.run(`INSERT OR IGNORE INTO schedules (doctor_id, day_of_week, max_slots) VALUES 
    (1, 1, 25), (1, 3, 25), (1, 5, 20),
    (2, 2, 30), (2, 4, 30),
    (3, 1, 20), (3, 2, 20), (3, 4, 20), (3, 5, 20),
    (4, 1, 35), (4, 3, 35), (4, 5, 35),
    (5, 2, 25), (5, 4, 25)`
  );

  console.log('数据库初始化完成！');
  console.log('默认账号：');
  console.log('  管理员: admin / admin123');
  console.log('  患者: patient1 / patient123');
  console.log('  患者: patient2 / patient123');
});

db.close();
