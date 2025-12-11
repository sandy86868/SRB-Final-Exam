const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// 首頁
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));

// 功能 1 & 5: 取得國家列表
app.get('/countries', async (req, res) => {
    try {
        const result = await pool.query('SELECT CountryCode, CountryName FROM Countries ORDER BY CountryName');
        let html = '<option value="">Select Country</option>';
        result.rows.forEach(r => html += `<option value="${r.countrycode}">${r.countryname}</option>`);
        res.send(html);
    } catch (e) { 
        console.error(e);
        res.send('<option>Error loading countries</option>'); 
    }
});

// 功能 1: 顯示 SRB
app.get('/srb/:code', async (req, res) => {
    try {
        const result = await pool.query('SELECT Year, SRB FROM AnnualSRB WHERE CountryCode = $1 ORDER BY Year DESC', [req.params.code]);
        let html = '<table border="1" style="border-collapse: collapse; width: 100%;"><tr><th>Year</th><th>SRB</th></tr>';
        if(result.rows.length === 0) html += '<tr><td colspan="2">No Data</td></tr>';
        result.rows.forEach(r => html += `<tr><td>${r.year}</td><td>${r.srb}</td></tr>`);
        res.send(html + '</table>');
    } catch (e) { res.send('Error loading SRB data'); }
});

// 功能 4: 關鍵字搜尋
app.post('/search', async (req, res) => {
    const { keyword } = req.body;
    const sql = `
        SELECT c.CountryName, s.SRB, s.Year 
        FROM Countries c 
        JOIN AnnualSRB s ON c.CountryCode = s.CountryCode 
        WHERE c.CountryName ILIKE $1 
        AND s.Year = (SELECT MAX(Year) FROM AnnualSRB WHERE CountryCode = c.CountryCode)
        ORDER BY c.CountryName`;
    try {
        const result = await pool.query(sql, [`%${keyword}%`]);
        if(result.rows.length === 0) return res.send('No matches found.');
        let html = '<ul>';
        result.rows.forEach(r => html += `<li><b>${r.countryname}</b>: ${r.srb} (Year: ${r.year})</li>`);
        res.send(html + '</ul>');
    } catch (e) { res.send('Search error'); }
});

// 功能 5: 新增下一年度資料 (Insert)
app.post('/add-next-year', async (req, res) => {
    const { country_code, srb_value } = req.body;
    try {
        // 找出該國最大年份
        const maxYearRes = await pool.query('SELECT MAX(Year) as maxy FROM AnnualSRB WHERE CountryCode = $1', [country_code]);
        const currentMax = maxYearRes.rows[0].maxy;
        const nextYear = currentMax ? currentMax + 1 : 2024;
        
        await pool.query('INSERT INTO AnnualSRB (CountryCode, Year, SRB) VALUES ($1, $2, $3)', [country_code, nextYear, srb_value]);
        res.send(`✅ Success! Added SRB <b>${srb_value}</b> for year <b>${nextYear}</b>.`);
    } catch (e) { 
        res.send('❌ Error: ' + e.message); 
    }
});

app.listen(3000, () => console.log('Server running on 3000'));