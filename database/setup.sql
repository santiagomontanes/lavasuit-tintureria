CREATE DATABASE IF NOT EXISTS lavasuit_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'lavasuit_user'@'localhost' IDENTIFIED BY 'lavasuit_pass_2024';

GRANT ALL PRIVILEGES ON lavasuit_db.* TO 'lavasuit_user'@'localhost';

FLUSH PRIVILEGES;

SHOW DATABASES;
