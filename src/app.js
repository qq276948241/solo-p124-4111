require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const doctorRoutes = require('./routes/doctors');
const scheduleRoutes = require('./routes/schedules');
const appointmentRoutes = require('./routes/appointments');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: '社区诊所预约挂号API',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register'
      },
      doctors: {
        list: 'GET /api/doctors',
        detail: 'GET /api/doctors/:id',
        create: 'POST /api/doctors (admin)',
        update: 'PUT /api/doctors/:id (admin)',
        delete: 'DELETE /api/doctors/:id (admin)',
        departments: 'GET /api/departments'
      },
      schedules: {
        list: 'GET /api/schedules',
        doctor_schedules: 'GET /api/schedules/doctor/:doctor_id',
        create: 'POST /api/schedules (admin)',
        update: 'PUT /api/schedules/:id (admin)',
        delete: 'DELETE /api/schedules/:id (admin)'
      },
      appointments: {
        available: 'GET /api/appointments/available?department_id=&date=',
        my_appointments: 'GET /api/appointments/my (patient)',
        create: 'POST /api/appointments (patient)',
        cancel: 'POST /api/appointments/:id/cancel (patient)'
      }
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', doctorRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', appointmentRoutes);

app.use((req, res) => {
  res.status(404).json({ message: '请求的资源不存在' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`社区诊所预约挂号API已启动`);
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`默认账号:`);
  console.log(`  管理员: admin / admin123`);
  console.log(`  患者: patient1 / patient123`);
});

module.exports = app;
