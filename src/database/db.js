const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

const dbPath = path.join(__dirname, '..', '..', 'data', 'clinic.db');
const db = new sqlite3.Database(dbPath);

db.runAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};
db.getAsync = promisify(db.get).bind(db);
db.allAsync = promisify(db.all).bind(db);
db.execAsync = promisify(db.exec).bind(db);

db.beginTransaction = () => db.runAsync('BEGIN TRANSACTION');
db.commit = () => db.runAsync('COMMIT');
db.rollback = () => db.runAsync('ROLLBACK');

module.exports = db;
