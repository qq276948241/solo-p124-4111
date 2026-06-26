const express = require('express');
const { authMiddleware, patientMiddleware } = require('../middleware/auth');
const { AppError, createFeedback, getDoctorFeedbacks, getMyFeedbacks } = require('../database/feedbackRepo');

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function validatePagination(page, pageSize) {
  if (page < 1) {
    throw new AppError('页码不能小于1', 400);
  }
  if (pageSize < 1 || pageSize > 100) {
    throw new AppError('每页条数必须在1到100之间', 400);
  }
}

router.post('/feedbacks', authMiddleware, patientMiddleware, asyncHandler(async (req, res) => {
  const patientId = req.user.id;
  const { appointment_id, rating, comment } = req.body;

  if (appointment_id === undefined || appointment_id === null || rating === undefined || rating === null) {
    throw new AppError('预约ID和评分不能为空', 400);
  }

  const ratingNum = parseInt(rating);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new AppError('评分必须是1到5之间的整数', 400);
  }

  const result = await createFeedback(patientId, appointment_id, ratingNum, comment);
  res.status(201).json({
    ...result,
    message: '评价提交成功'
  });
}));

router.get('/feedbacks/doctor/:doctor_id', authMiddleware, asyncHandler(async (req, res) => {
  const { doctor_id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.page_size) || 10;

  validatePagination(page, pageSize);

  const result = await getDoctorFeedbacks(doctor_id, page, pageSize);
  res.json(result);
}));

router.get('/feedbacks/my', authMiddleware, patientMiddleware, asyncHandler(async (req, res) => {
  const patientId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.page_size) || 10;

  validatePagination(page, pageSize);

  const result = await getMyFeedbacks(patientId, page, pageSize);
  res.json(result);
}));

router.use((err, req, res, next) => {
  if (err.isAppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('Feedback route error:', err);
  res.status(500).json({ message: '服务器错误' });
});

module.exports = router;
