import sqlite3

con = sqlite3.connect(':memory:')
cur = con.cursor()
cur.executescript('''
CREATE TABLE star(star_id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,email_id INTEGER);
CREATE TABLE verify_record(vr_id INTEGER PRIMARY KEY AUTOINCREMENT,ip TEXT,count INTEGER,type INTEGER,update_time TEXT);
CREATE TABLE oauth(oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,oauth_user_id TEXT,user_id INTEGER);
CREATE TABLE device_token(token_id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,device_token TEXT,platform TEXT,create_time TEXT);
CREATE TABLE role_perm(id INTEGER PRIMARY KEY AUTOINCREMENT,role_id INTEGER,perm_id INTEGER);
CREATE TABLE role(role_id INTEGER PRIMARY KEY,is_default INTEGER);
CREATE TABLE user(user_id INTEGER PRIMARY KEY,type INTEGER,is_del INTEGER,status INTEGER);
CREATE TABLE perm(perm_id INTEGER PRIMARY KEY);
CREATE TABLE email(email_id INTEGER PRIMARY KEY,resend_email_id TEXT,user_id INTEGER,type INTEGER,is_del INTEGER,account_id INTEGER,status INTEGER);
CREATE TABLE account(account_id INTEGER PRIMARY KEY,user_id INTEGER,is_del INTEGER,sort INTEGER,email TEXT);
CREATE TABLE attachments(att_id INTEGER PRIMARY KEY,email_id INTEGER,user_id INTEGER,key TEXT,account_id INTEGER);
CREATE TABLE reg_key(rege_key_id INTEGER PRIMARY KEY,expire_time TEXT,count INTEGER);
''')
cur.executescript('''
INSERT INTO email VALUES (1,'r1',1,0,0,1,0);
INSERT INTO star(user_id,email_id) VALUES(1,1),(1,1),(2,999);
INSERT INTO verify_record(ip,count,type,update_time) VALUES('1.1.1.1',2,0,'2026-01-01'),('1.1.1.1',3,0,'2026-01-02');
INSERT INTO oauth(oauth_user_id,user_id) VALUES('u1',0),('u1',10),('u2',0),('u2',0);
INSERT INTO device_token(user_id,device_token,platform,create_time) VALUES(1,'aa','ios','1'),(2,'aa','ios','2'),(2,'bb','ios','3');
INSERT INTO role(role_id,is_default) VALUES(1,1),(2,1),(3,0);
INSERT INTO perm VALUES(1);
INSERT INTO role_perm(role_id,perm_id) VALUES(1,1),(1,1),(99,1),(1,99);
INSERT INTO user VALUES(1,1,0,0);
INSERT INTO account VALUES(1,1,0,1,'a@example.com');
INSERT INTO attachments VALUES(1,1,1,'attachments/x',1);
INSERT INTO reg_key VALUES(1,'2027-01-01',2);
''')

v32 = [
"DELETE FROM star WHERE star_id NOT IN (SELECT MIN(star_id) FROM star GROUP BY user_id, email_id)",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_star_user_email_unique ON star(user_id, email_id)",
"UPDATE verify_record SET count = (SELECT SUM(v2.count) FROM verify_record v2 WHERE v2.ip = verify_record.ip AND v2.type = verify_record.type), update_time = (SELECT MAX(v3.update_time) FROM verify_record v3 WHERE v3.ip = verify_record.ip AND v3.type = verify_record.type) WHERE vr_id IN (SELECT MIN(vr_id) FROM verify_record GROUP BY ip, type)",
"DELETE FROM verify_record WHERE vr_id NOT IN (SELECT MIN(vr_id) FROM verify_record GROUP BY ip, type)",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_verify_record_ip_type ON verify_record(ip, type)",
"CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth(oauth_user_id)",
"CREATE INDEX IF NOT EXISTS idx_oauth_bound_user ON oauth(user_id)",
"CREATE INDEX IF NOT EXISTS idx_email_resend_id ON email(resend_email_id)",
"CREATE INDEX IF NOT EXISTS idx_email_user_type_del_id ON email(user_id, type, is_del, email_id)",
"CREATE INDEX IF NOT EXISTS idx_email_account_del_id ON email(account_id, is_del, email_id)",
"CREATE INDEX IF NOT EXISTS idx_account_user_del_sort_id ON account(user_id, is_del, sort DESC, account_id)",
"CREATE INDEX IF NOT EXISTS idx_attachments_email_user ON attachments(email_id, user_id)",
"CREATE INDEX IF NOT EXISTS idx_attachments_key_user ON attachments(key, user_id)",
"CREATE INDEX IF NOT EXISTS idx_reg_key_expire_count ON reg_key(expire_time, count)",
]
v33 = [
"DELETE FROM oauth WHERE user_id = 0 AND EXISTS (SELECT 1 FROM oauth o2 WHERE o2.oauth_user_id = oauth.oauth_user_id AND o2.user_id > 0)",
"DELETE FROM oauth WHERE oauth_id NOT IN (SELECT MIN(oauth_id) FROM oauth GROUP BY oauth_user_id)",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_user_id_unique ON oauth(oauth_user_id) WHERE oauth_user_id IS NOT NULL AND oauth_user_id != ''",
"DELETE FROM device_token WHERE token_id NOT IN (SELECT MAX(token_id) FROM device_token GROUP BY device_token)",
"DROP INDEX IF EXISTS idx_device_token_unique",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_device_token_global_unique ON device_token(device_token)",
"DELETE FROM role_perm WHERE id NOT IN (SELECT MIN(id) FROM role_perm GROUP BY role_id, perm_id)",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_role_perm_unique ON role_perm(role_id, perm_id)",
"UPDATE role SET is_default = 0 WHERE is_default = 1 AND role_id NOT IN (SELECT MIN(role_id) FROM role WHERE is_default = 1)",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_role_single_default ON role(is_default) WHERE is_default = 1",
"CREATE INDEX IF NOT EXISTS idx_device_token_user_created ON device_token(user_id, create_time DESC)",
"CREATE INDEX IF NOT EXISTS idx_user_role_state ON user(type, is_del, status)",
"CREATE INDEX IF NOT EXISTS idx_verify_record_updated ON verify_record(update_time)",
"DELETE FROM star WHERE NOT EXISTS (SELECT 1 FROM email WHERE email.email_id = star.email_id)",
"DELETE FROM role_perm WHERE NOT EXISTS (SELECT 1 FROM role WHERE role.role_id = role_perm.role_id) OR NOT EXISTS (SELECT 1 FROM perm WHERE perm.perm_id = role_perm.perm_id)",
]
for statement in v32 + v33:
    cur.execute(statement)
con.commit()
assert cur.execute('select count(*), count(distinct user_id||":"||email_id) from star').fetchone() == (1,1)
assert cur.execute('select count,update_time from verify_record').fetchone() == (5,'2026-01-02')
assert cur.execute("select user_id from oauth where oauth_user_id='u1'").fetchone() == (10,)
assert cur.execute("select count(*) from oauth where oauth_user_id='u2'").fetchone() == (1,)
assert cur.execute("select user_id from device_token where device_token='aa'").fetchone() == (2,)
assert cur.execute('select count(*) from role_perm').fetchone() == (1,)
assert cur.execute('select count(*) from role where is_default=1').fetchone() == (1,)
print('security migrations: PASS')
