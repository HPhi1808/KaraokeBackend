const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function taoTaiKhoanMau() {
    try {
        console.log("⏳ Đang tạo tài khoản mẫu...");
        
        const sdt = "0987654321"; // Số điện thoại test
        const matKhau = "123456"; // Mật khẩu test
        const ten = "Admin Dep Trai";

        // 1. Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(matKhau, salt);

        // 2. Lưu vào database
        // Chú ý: Nếu số điện thoại đã có rồi thì code này sẽ báo lỗi (do UNIQUE)
        const res = await pool.query(
            `INSERT INTO users (phone_number, password_hash, full_name, role) 
             VALUES ($1, $2, $3, 'ADMIN') 
             RETURNING *`,
            [sdt, passwordHash, ten]
        );

        console.log("✅ TẠO THÀNH CÔNG!");
        console.log("---------------------------------");
        console.log("Tài khoản: " + sdt);
        console.log("Mật khẩu:  " + matKhau);
        console.log("---------------------------------");

    } catch (err) {
        console.error("❌ Lỗi tạo user: ", err.message);
    } finally {
        pool.end();
    }
}

taoTaiKhoanMau();