const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const connection = require('./controller/connection');
const multer = require('multer');
const fs = require('fs');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// Konfigurasi storage
const storages = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads')); // pastikan path-nya benar
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + path.extname(file.originalname);
    cb(null, uniqueSuffix);
  }
});

// Filter untuk validasi file (opsional)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Inisialisasi multer
const uploads = multer({
  storage: storages,
  fileFilter: fileFilter
});

module.exports = uploads;

function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.send(`<script>alert('Anda harus login terlebih dahulu'); window.location.href = '/login';</script>`);
}

const { loginLimiter, registerLimiter } = require('./middleware/limiter.js');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'secret-key-2341',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // ubah ke true kalau udah pakai HTTPS
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/bootstrap-icons', express.static(path.join(__dirname, 'node_modules', 'bootstrap-icons')));
app.use('/typeit', express.static(path.join(__dirname, 'node_modules', 'typeit')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/view-task', (req, res) => {
    res.render('view-task');
});

app.get('/login', (req, res) => {
    res.render('login', { data: req.body });
});

app.get('/regis', (req, res) => {
    res.render('regis');
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // rename unik
    }
});

const upload = multer({ storage });

// REGISTER
app.post('/regis/submit', async (req, res) => {
    const { username, email, password } = req.body;
    const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await connection.promise().query(sql, [username, email, hashedPassword]);
        res.send(`<script>alert('User registered successfully'); window.location.href = '/login';</script>`);
    } catch (error) {
        console.error(error);
        res.status(500).send(`<script>alert('Error registering user'); window.location.href = '/regis';</script>`);
    }
});

// LOGIN
app.post('/login/submit', async (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT * FROM users WHERE username = ?';

    try {
        const [rows] = await connection.promise().query(sql, [username]);
        if (rows.length === 0) {
            return res.send(`<script>alert('Username tidak ditemukan!'); window.location.href = '/login';</script>`);
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.send(`<script>alert('Password salah!'); window.location.href = '/login';</script>`);
        }

        req.session.user = { id: user.id, username: user.username, email: user.email };
        res.send(`<script>alert('Login berhasil!'); window.location.href = '/dashboard';</script>`);
    } catch (error) {
        console.error(error);
        res.status(500).send(`<script>alert('Terjadi kesalahan server'); window.location.href = '/login';</script>`);
    }
});

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const [tasks] = await connection.promise().query(
            'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
            [req.session.user.id]
        );

        res.render('dashboard', { user: req.session.user, tasks });
    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan saat memuat dashboard');
    }
});

app.get('/add-task', ensureAuthenticated, (req, res) => {
    res.render('add', { user: req.session.user });
});

// ADD TASK (POST)
app.post('/add-task/submit', ensureAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const { title, description } = req.body;
    const todos = req.body.todos || []; // biar gak undefined

    const todosJSON = JSON.stringify(todos);

    const sql = `INSERT INTO tasks (user_id, title, description, todos)
                 VALUES (?, ?, ?, ?)`;

    connection.query(sql, [userId, title, description, todosJSON], (err) => {
        if (err) {
            console.error('Error inserting task:', err);
            return res.status(500).send(`<script>alert('Gagal menambah task'); window.location.href='/add-task';</script>`);
        }
        res.send(`<script>alert('Task berhasil ditambah!'); window.location.href='/dashboard';</script>`);
    });
});

app.get('/delete/:id', ensureAuthenticated, async (req, res) => {

    const taskId = req.params.id;
    const sql = 'DELETE FROM tasks WHERE id = ? AND user_id = ?';

    try {
        await connection.promise().query(sql, [taskId, req.session.user.id]);
        res.send(`<script>alert('Task berhasil dihapus!'); window.location.href = '/dashboard';</script>`);
    } catch (error) {
        console.error(error);
        res.status(500).send(`<script>alert('Gagal menghapus task'); window.location.href = '/dashboard';</script>`);
    }
});

app.get('/gallery', ensureAuthenticated, async (req, res) => {
 
    const sql = 'SELECT * FROM gallery WHERE user_id = ?';

    try {
        const [images] = await connection.promise().query(sql, [req.session.user.id]);
        res.render('gallery', { user: req.session.user, images });
    } catch (error) {
        console.error(error);
        res.status(500).send(`<script>alert('Gagal memuat gallery'); window.location.href = '/dashboard';</script>`);
    }
});

app.get('/add-image', ensureAuthenticated, (req, res) => {
    res.render('add-img', { user: req.session.user });
});

app.get('/view/:id', ensureAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM tasks WHERE id = ? AND user_id = ?';

    connection.query(sql, [id, req.session.user.id], (err, result) => {
        if (err) throw err;
        if (result.length === 0) {
            return res.send(`<script>alert('Task not found or unauthorized'); window.location.href='/dashboard';</script>`);
        }

        // ✅ Parse kolom todos biar langsung jadi array
        const task = {
            ...result[0],
            todos: JSON.parse(result[0].todos || '[]')
        };

        // ✅ Kirim ke EJS
        res.render('view-task', { task });
    });
});

app.post('/view-edit/:id', ensureAuthenticated, (req, res) => {
    const id = req.params.id;
    const { title, description } = req.body;
    const todos = req.body.todos || [];
    const todosJSON = JSON.stringify(todos);

    const sql = 'UPDATE tasks SET title = ?, description = ? WHERE id = ? AND user_id = ?';
    const params = [title, description, id, req.session.user.id];

    connection.query(sql, params, (err) => {
        if (err) throw err;
        res.send(`<script>alert('Task updated successfully'); window.location.href='/dashboard';</script>`);
    });
});

app.post('/edit-image/:id', ensureAuthenticated, upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { title, description } = req.body;
    let sql;
    let params;

    if (req.file) {
        const newImagePath = `/uploads/${req.file.filename}`;
        // hapus file lama
        const getOld = 'SELECT image_path FROM gallery WHERE id = ?';
        connection.query(getOld, [id], (err, result) => {
            if (result[0]?.image_path) {
                const oldPath = path.join(__dirname, 'public', result[0].image_path);
                fs.unlink(oldPath, () => {});
            }
        });

        sql = 'UPDATE gallery SET image_path = ?, title = ?, description = ? WHERE id = ? AND user_id = ?';
        params = [newImagePath, title, description, id, req.session.user.id];
    } else {
        sql = 'UPDATE gallery SET title = ?, description = ? WHERE id = ? AND user_id = ?';
        params = [title, description, id, req.session.user.id];
    }

    connection.query(sql, params, (err) => {
        if (err) throw err;
        res.send(`<script>alert('Image updated successfully'); window.location.href='/gallery';</script>`);
    });
});

app.get('/edit-image/:id', ensureAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM gallery WHERE id = ? AND user_id = ?';
    connection.query(sql, [id, req.session.user.id], (err, result) => {
        if (err) throw err;
        if (result.length === 0) {
            return res.send(`<script>alert('Image not found or unauthorized'); window.location.href='/gallery';</script>`);
        }
        res.render('edit-image', { image: result[0], user: req.session.user });
    });
});


app.post('/add-image/submit', ensureAuthenticated, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send(`<script>alert('No file uploaded'); window.location.href = '/add-image';</script>`);
    }

    const { title, description } = req.body; // ambil dari input form
    const imagePath = `/uploads/${req.file.filename}`;
    const sql = 'INSERT INTO gallery (user_id, image_path, title, description) VALUES (?, ?, ?, ?)';

    try {
        await connection.promise().query(sql, [req.session.user.id, imagePath, title, description]);
        res.send(`<script>alert('Image berhasil ditambahkan!'); window.location.href = '/gallery';</script>`);
    } catch (error) {
        console.error(error);
        res.status(500).send(`<script>alert('Gagal menambahkan image'); window.location.href = '/add-image';</script>`);
    }
});

app.get('/delete-image/:id', ensureAuthenticated, async (req, res) => {

    const imageId = req.params.id;
    const sql = 'DELETE FROM gallery WHERE id = ? AND user_id = ?';

    try {
        await connection.promise().query(sql, [imageId, req.session.user.id]);
        res.send(`<script>alert('Image berhasil dihapus!'); window.location.href = '/gallery';</script>`);
    } catch (error) {
        console.error(error);
        res.status(500).send(`<script>alert('Gagal menghapus image'); window.location.href = '/gallery';</script>`);
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/login');
    });
});




app.listen(3000, () => {
    console.log('Server is running at http://localhost:3000');
});
