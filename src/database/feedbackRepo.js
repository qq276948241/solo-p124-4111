const db = require('./db');

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isAppError = true;
  }
}

async function getAppointmentForPatient(appointmentId, patientId) {
  return db.getAsync(
    'SELECT * FROM appointments WHERE id = ? AND patient_id = ?',
    [appointmentId, patientId]
  );
}

async function getFeedbackByAppointment(appointmentId) {
  return db.getAsync(
    'SELECT id FROM feedbacks WHERE appointment_id = ?',
    [appointmentId]
  );
}

async function insertFeedback(patientId, doctorId, appointmentId, rating, comment) {
  const result = await db.runAsync(
    'INSERT INTO feedbacks (patient_id, doctor_id, appointment_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
    [patientId, doctorId, appointmentId, rating, comment || null]
  );
  return result.lastID;
}

async function getDoctorRatingStats(doctorId) {
  return db.getAsync(
    'SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count FROM feedbacks WHERE doctor_id = ?',
    [doctorId]
  );
}

async function updateDoctorRating(doctorId, avgRating, ratingCount) {
  return db.runAsync(
    'UPDATE doctors SET avg_rating = ?, rating_count = ? WHERE id = ?',
    [avgRating, ratingCount, doctorId]
  );
}

async function createFeedback(patientId, appointmentId, rating, comment) {
  const appointment = await getAppointmentForPatient(appointmentId, patientId);
  if (!appointment) {
    throw new AppError('预约不存在或不属于您', 400);
  }
  if (appointment.status !== 'completed') {
    throw new AppError('预约尚未完成，暂不能评价', 400);
  }

  const existing = await getFeedbackByAppointment(appointmentId);
  if (existing) {
    throw new AppError('该预约已评价，不能重复提交', 400);
  }

  await db.beginTransaction();
  try {
    const feedbackId = await insertFeedback(
      patientId,
      appointment.doctor_id,
      appointmentId,
      rating,
      comment
    );

    const stats = await getDoctorRatingStats(appointment.doctor_id);
    const newAvg = Math.round(stats.avg_rating * 10) / 10;
    const newCount = stats.rating_count;
    await updateDoctorRating(appointment.doctor_id, newAvg, newCount);

    await db.commit();

    return {
      id: feedbackId,
      patient_id: patientId,
      doctor_id: appointment.doctor_id,
      appointment_id: parseInt(appointmentId),
      rating,
      comment: comment || null,
      doctor_avg_rating: newAvg,
      doctor_rating_count: newCount
    };
  } catch (err) {
    await db.rollback();
    throw err;
  }
}

async function getDoctorById(doctorId) {
  return db.getAsync('SELECT id FROM doctors WHERE id = ?', [doctorId]);
}

async function countDoctorFeedbacks(doctorId) {
  const result = await db.getAsync(
    'SELECT COUNT(*) as total FROM feedbacks WHERE doctor_id = ?',
    [doctorId]
  );
  return result.total;
}

async function listDoctorFeedbacks(doctorId, pageSize, offset) {
  return db.allAsync(
    `SELECT 
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
     LIMIT ? OFFSET ?`,
    [doctorId, pageSize, offset]
  );
}

async function getDoctorRatingSummary(doctorId) {
  return db.getAsync(
    'SELECT avg_rating, rating_count FROM doctors WHERE id = ?',
    [doctorId]
  );
}

async function getDoctorFeedbacks(doctorId, page, pageSize) {
  const doctor = await getDoctorById(doctorId);
  if (!doctor) {
    throw new AppError('医生不存在', 404);
  }

  const total = await countDoctorFeedbacks(doctorId);
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const list = await listDoctorFeedbacks(doctorId, pageSize, offset);
  const stats = await getDoctorRatingSummary(doctorId);

  return {
    doctor_id: parseInt(doctorId),
    avg_rating: stats ? stats.avg_rating : 0,
    rating_count: stats ? stats.rating_count : 0,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages
    },
    list
  };
}

async function countMyFeedbacks(patientId) {
  const result = await db.getAsync(
    'SELECT COUNT(*) as total FROM feedbacks WHERE patient_id = ?',
    [patientId]
  );
  return result.total;
}

async function listMyFeedbacks(patientId, pageSize, offset) {
  return db.allAsync(
    `SELECT 
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
     LIMIT ? OFFSET ?`,
    [patientId, pageSize, offset]
  );
}

async function getMyFeedbacks(patientId, page, pageSize) {
  const total = await countMyFeedbacks(patientId);
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const list = await listMyFeedbacks(patientId, pageSize, offset);

  return {
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages
    },
    list
  };
}

module.exports = {
  AppError,
  createFeedback,
  getDoctorFeedbacks,
  getMyFeedbacks
};
