const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ message: '服务器错误' });
    }

    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        phone: user.phone
      }
    });
  });
});

router.post('/register', (req, res) => {
  const { username, password, name, phone } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ message: '用户名、密码和姓名不能为空' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, ?, ?, ?)',
    [username, hashedPassword, 'patient', name, phone || null],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ message: '用户名已存在' });
        }
        return res.status(500).json({ message: '服务器错误' });
      }

      const user = { id: this.lastID, username, role: 'patient', name };
      const token = generateToken(user);
      res.status(201).json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
          phone: phone || null
        }
      });
    }
  );
});

module.exports = router;
