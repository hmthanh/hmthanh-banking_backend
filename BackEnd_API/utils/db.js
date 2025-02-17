const mysql = require("mysql");
const { promisify } = require("util");
const config = require("../config");
const pool = mysql.createPool({
  connectionLimit: 10,
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_BANKING_NAME,
});

const pool_query = promisify(pool.query).bind(pool);

module.exports = {
  load: (sql) => {
    return new Promise((resolve, reject) => {
      pool_query(sql, null, (err, rows) => {
        // console.log("sql : ", sql, "\nload : ", err);
        console.log("sql query : ", sql);
        // console.log("rows :: ", rows);
        if (err){
          console.log("err :: ", err);
        }
        resolve(rows);
      });
    });
  },
  add: (entity, tableName) => {
    return new Promise((resolve, reject) => {
      pool_query(`insert into ${tableName} set ?`, entity, (err, rows) => {
        console.log("entity : ", entity, "tableName", tableName);
        console.log("rows :: ", rows);
        // if (err){
        //   console.log("err :: ", err);
        // }
        console.log("err :: ", err);
        resolve(rows);
      });
    });
  },
  del: (condition, tableName) => {
    return new Promise((resolve, reject) => {
      pool_query(`delete from ${tableName} where ?`, condition, (err, rows) => {
        console.log("del err", err);
        resolve(rows);
      });
    });
  },
  patch: (entity, condition, tableName) => {
    return new Promise((resolve, reject) => {
      pool_query(
        `update ${tableName} set ? where ?`,
        [entity, condition],
        (err, rows) => {
          if (err){
            console.log("err :: ", err);
          }
          resolve(rows);
        }
      );
    });
  },
  plus: (entity, accNum) =>
    new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.beginTransaction((err) => {
          if (err) throw err;
          connection.query(
            "SELECT b.surplus, b.id FROM banking_info b JOIN user_account u ON b.owner_id = u.id WHERE u.account_num=? AND type=1 FOR" +
              " UPDATE",
            accNum,
            (error, results, fields) => {
              if (error)
                return connection.rollback(function () {
                  throw error;
                });
              const { surplus, id } = results[0];
              let acc = parseInt(surplus) + parseInt(entity.amount);
              connection.query(
                "UPDATE banking_info SET ? WHERE ?",
                [{ surplus: acc }, { id: id }],
                (error, results, fields) => {
                  if (error)
                    return connection.rollback(function () {
                      throw error;
                    });
                  else {
                    entity.state = 0;
                    entity.surplus = acc;
                    connection.query(
                      `INSERT INTO transaction_tranfer SET ?`,
                      entity,
                      (error, results, fields) => {
                        if (error)
                          return connection.rollback(function () {
                            throw error;
                          });
                        else {
                          connection.commit(function (err) {
                            if (err)
                              return connection.rollback(function () {
                                throw err;
                              });
                            connection.release();
                            resolve({
                              tranId: results.insertId,
                              accountNum: entity.to_account,
                              amount: entity.amount, // đơn vị VND
                            });
                          });
                        }
                      }
                    );
                  }
                }
              );
            }
          );
        });
      });
    }),
  minus: (entity) =>
    new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.beginTransaction((err) => {
          if (err) throw err;
          connection.query(
            "SELECT surplus, b.id FROM banking_info b JOIN user_account u ON b.id = u.id WHERE u.account_num=? FOR UPDATE",
            entity.to_account,
            (error, results, fields) => {
              if (error)
                return connection.rollback(function () {
                  throw error;
                });
              const { surplus, id } = results[0];
              if (surplus < entity.amount) resolve(-1);
              else {
                let acc = surplus - entity.amount;
                connection.query(
                  "UPDATE banking_info SET ? WHERE ?",
                  [{ surplus: acc }, { id: id }],
                  (error, results, fields) => {
                    if (error)
                      return connection.rollback(function () {
                        throw error;
                      });
                    else {
                      entity.surplus = surplus;
                      connection.query(
                        `INSERT INTO transaction_tranfer SET ?`,
                        entity,
                        (error, results, fields) => {
                          if (error)
                            return connection.rollback(function () {
                              throw error;
                            });
                          else {
                            connection.commit(function (err) {
                              if (err)
                                return connection.rollback(function () {
                                  throw err;
                                });
                              connection.release();
                              resolve(0);
                            });
                          }
                        }
                      );
                    }
                  }
                );
              }
            }
          );
        });
      });
    }),
  minusTransfer: (tranId, amount, account) =>
    new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.beginTransaction((err) => {
          if (err) throw err;
          connection.query(
            "SELECT b.surplus, b.id FROM banking_info b JOIN user_account u ON b.owner_id = u.id WHERE u.account_num=? FOR UPDATE",
            account,
            (error, results, fields) => {
              if (error) {
                console.log(error);
                return connection.rollback(function () {
                  throw error;
                });
              }

              const { surplus, id } = results[0];
              if (surplus < amount) resolve(-1);
              else {
                let acc = parseInt(surplus) - parseInt(amount);
                connection.query(
                  "UPDATE banking_info SET ? WHERE ?",
                  [{ surplus: acc }, { id: id }],
                  (error, results, fields) => {
                    if (error)
                      return connection.rollback(function () {
                        throw error;
                      });
                    else {
                      connection.query(
                        "UPDATE transaction_tranfer SET ? WHERE ?",
                        [
                          { surplus: acc, state: 0, type: 2 },
                          { trans_id: tranId },
                        ],
                        (error, results, fields) => {
                          if (error)
                            return connection.rollback(function () {
                              throw error;
                            });
                          else {
                            connection.commit(function (err) {
                              if (err)
                                return connection.rollback(function () {
                                  throw err;
                                });
                              connection.release();
                              resolve(0);
                            });
                          }
                        }
                      );
                    }
                  }
                );
              }
            }
          );
        });
      });
    }),

  plusTransfer: (tranId, amount, account) =>
    new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.beginTransaction((err) => {
          if (err) throw err;
          connection.query(
            "SELECT b.surplus, b.id FROM banking_info b JOIN user_account u ON b.id = u.id WHERE u.account_num=? FOR UPDATE",
            account,
            (error, results, fields) => {
              if (error) {
                console.log(error);
                return connection.rollback(function () {
                  throw error;
                });
              }

              const { surplus, id } = results[0];
              let acc = surplus + amount;
              connection.query(
                "UPDATE banking_info SET ? WHERE ?",
                [{ surplus: acc }, { id: id }],
                (error, results, fields) => {
                  if (error)
                    return connection.rollback(function () {
                      throw error;
                    });
                  else {
                    connection.query(
                      "UPDATE transaction_tranfer SET state=1 WHERE ?",
                      [{ trans_id: tranId }],
                      (error, results, fields) => {
                        if (error)
                          return connection.rollback(function () {
                            throw error;
                          });
                        else {
                          connection.commit(function (err) {
                            if (err)
                              return connection.rollback(function () {
                                throw err;
                              });
                            connection.release();
                            resolve(0);
                          });
                        }
                      }
                    );
                  }
                }
              );
            }
          );
        });
      });
    }),
  getPool: () => pool,
};
