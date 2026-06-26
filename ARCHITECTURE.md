# 社区诊所预约挂号后端 - 项目架构说明

这是一个 Node.js + Express + SQLite 的社区诊所预约挂号 API，新来的同学看这篇就能快速上手。

## 目录结构

```
project124/
├── data/clinic.db          # SQLite 数据库文件
├── src/
│   ├── app.js              # 服务入口，挂中间件、挂路由、全局错误处理
│   ├── database/           # 数据库相关
│   │   ├── db.js           # SQLite 连接 + promisify 封装（async/await 用的）
│   │   ├── init.js         # 初始化数据库（建表 + 灌默认数据）
│   │   ├── migration.js    # 升级脚本（已有库加字段/表时跑这个）
│   │   └── feedbackRepo.js # 评价模块的数据库操作封装（其他模块还没拆，后续建议照这个模式）
│   ├── middleware/
│   │   └── auth.js         # JWT 鉴权中间件，区分 admin / patient
│   └── routes/             # 每个路由文件对应一个业务模块
│       ├── auth.js         # 登录 / 注册
│       ├── doctors.js      # 医生 & 科室管理（增删改查）
│       ├── schedules.js    # 医生排班（设置每周坐诊日 + 号源数）
│       ├── appointments.js # 预约（查号源 / 预约 / 取消 / 标记完成）
│       └── feedback.js     # 评价（提交评价 / 查医生评价 / 查我的评价）
├── .env                    # 端口、JWT 密钥、DB 路径配置
└── package.json
```

## 请求怎么流转

请求进来 → CORS 中间件 → 路由匹配 → `authMiddleware` 校验 JWT → `adminMiddleware` / `patientMiddleware` 校验角色 → 路由处理器调 repo / db → 返回 JSON。全局错误中间件兜底，业务错误用 `AppError` 抛，不会直接 500。

## 数据库表结构

| 表名 | 干啥的 | 关键字段 |
|------|--------|---------|
| users | 用户（管理员 + 患者） | id, username, password(加密), role(admin/patient), name |
| departments | 科室 | id, name |
| doctors | 医生 | id, name, department_id, title, avg_rating, rating_count |
| schedules | 每周排班 | id, doctor_id, day_of_week(1-7), max_slots |
| appointments | 预约记录 | id, patient_id, doctor_id, appointment_date, status(booked/cancelled/completed) |
| feedbacks | 评价记录 | id, patient_id, doctor_id, appointment_id(UNIQUE), rating(1-5), comment |

外键关系：doctors.department_id → departments.id，其他都是字面意思。

## 几个关键设计点

- **JWT 登录**：账号密码查 users 表，bcrypt 比对，签发 token（24h 有效），接口带 `Authorization: Bearer <token>`
- **号源防超卖**：预约操作包在 `BEGIN TRANSACTION` 里，先 `COUNT` 已预约数再插入，最后 `COMMIT`，并发不会超
- **权限区分**：`authMiddleware` 把用户信息塞 `req.user`，管理员接口加 `adminMiddleware`，患者接口加 `patientMiddleware`
- **评价同步平均分**：提交评价时在同一事务里重新算 AVG，更新 doctors 表的 `avg_rating` / `rating_count` 字段，避免每次查都现算
- **重复评价拦截**：代码层先查有没有，数据库层 `appointment_id` UNIQUE 约束兜底，双层保险

## 本地启动

```bash
# 1. 装依赖
npm install

# 2. 初始化数据库（第一次跑或者想重置数据时用）
npm run init-db

# 3. 已有数据库加新字段时跑升级脚本
node src/database/migration.js

# 4. 启动服务
npm start
```

服务起来后默认在 http://localhost:3000，首页直接 GET 能看到所有接口清单。

默认账号：admin / admin123（管理员），patient1 / patient123、patient2 / patient123（患者）。
