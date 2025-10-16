const mysql = require('mysql2'); // ganti dari mysql ke mysql2

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'data'
});

connection.connect((error) => {
    if (error) {
        console.error('Error connecting to the database:', error);
    } else {
        console.log('Database connected!');
    }
});

module.exports = connection;
