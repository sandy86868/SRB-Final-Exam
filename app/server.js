const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 資料庫連線
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// 首頁
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));

// --- 共用 API: 下拉選單資料來源 ---

// 取得所有國家
app.get('/api/countries', async (req, res) => {
    try {
        const result = await pool.query('SELECT CountryCode, CountryName FROM Countries ORDER BY CountryName');
        let html = '<option value="">Select Country</option>';
        result.rows.forEach(r => html += `<option value="${r.countrycode}">${r.countryname}</option>`);
        res.send(html);
    } catch (e) { res.send('<option>Error</option>'); }
});

// 取得所有區域 (Regions)
app.get('/api/regions', async (req, res) => {
    try {
        const result = await pool.query('SELECT RegionCode, RegionName FROM Regions ORDER BY RegionName');
        let html = '<option value="">Select Region</option>';
        result.rows.forEach(r => html += `<option value="${r.regioncode}">${r.regionname}</option>`);
        res.send(html);
    } catch (e) { res.send('<option>Error</option>'); }
});

// 取得所有次區域 (SubRegions)
app.get('/api/subregions', async (req, res) => {
    try {
        const result = await pool.query('SELECT SubRegionCode, SubRegionName FROM SubRegions ORDER BY SubRegionName');
        let html = '<option value="">Select Sub-Region</option>';
        result.rows.forEach(r => html += `<option value="${r.subregioncode}">${r.subregionname}</option>`);
        res.send(html);
    } catch (e) { res.send('<option>Error</option>'); }
});

// 取得有資料的年份 (Distinct Years)
app.get('/api/years', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT Year FROM AnnualSRB ORDER BY Year DESC');
        let html = '<option value="">Select Year</option>';
        result.rows.forEach(r => html += `<option value="${r.year}">${r.year}</option>`);
        res.send(html);
    } catch (e) { res.send('<option>Error</option>'); }
});

// 取得特定國家的年份 (用於更新/刪除功能)
app.get('/api/years/:countryCode', async (req, res) => {
    try {
        const result = await pool.query('SELECT Year FROM AnnualSRB WHERE CountryCode = $1 ORDER BY Year DESC', [req.params.countryCode]);
        let html = '<option value="">Select Year</option>';
        result.rows.forEach(r => html += `<option value="${r.year}">${r.year}</option>`);
        res.send(html);
    } catch (e) { res.send('<option>Error</option>'); }
});


// --- 核心功能路由 (Requirements) ---

// Req 1: 選擇國家 -> 顯示歷年 SRB (降序)
// Implemented sorting by year descending as per requirements
app.get('/req1/srb/:code', async (req, res) => {
    try {
        const result = await pool.query('SELECT Year, SRB FROM AnnualSRB WHERE CountryCode = $1 ORDER BY Year DESC', [req.params.code]);
        if(result.rows.length === 0) return res.send('No data found.');
        let html = '<table class="table"><tr><th>Year</th><th>SRB</th></tr>';
        result.rows.forEach(r => html += `<tr><td>${r.year}</td><td>${r.srb}</td></tr>`);
        res.send(html + '</table>');
    } catch (e) { res.send('Error: ' + e.message); }
});

// Req 2: 選擇次區域 & 年份 -> 顯示該區國家 SRB (升序)
// Joined Countries and AnnualSRB tables to filter by SubRegion
app.post('/req2', async (req, res) => {
    const { subregion, year } = req.body;
    try {
        const sql = `
            SELECT c.CountryName, a.SRB
            FROM Countries c
            JOIN AnnualSRB a ON c.CountryCode = a.CountryCode
            WHERE c.SubRegionCode = $1 AND a.Year = $2
            ORDER BY a.SRB ASC`;
        const result = await pool.query(sql, [subregion, year]);
        if(result.rows.length === 0) return res.send('No data found for this combination.');
        let html = `<h4>Results for Year ${year}</h4><table class="table"><tr><th>Country</th><th>SRB</th></tr>`;
        result.rows.forEach(r => html += `<tr><td>${r.countryname}</td><td>${r.srb}</td></tr>`);
        res.send(html + '</table>');
    } catch (e) { res.send('Error: ' + e.message); }
});

// Req 3: 選擇區域 & 年份 -> 顯示次區域平均 SRB
app.post('/req3', async (req, res) => {
    const { region, year } = req.body;
    try {
        const sql = `
            SELECT sr.SubRegionName, AVG(a.SRB) as avg_srb
            FROM Regions r
            JOIN SubRegions sr ON r.RegionCode = sr.RegionCode
            JOIN Countries c ON sr.SubRegionCode = c.SubRegionCode
            JOIN AnnualSRB a ON c.CountryCode = a.CountryCode
            WHERE r.RegionCode = $1 AND a.Year = $2
            GROUP BY sr.SubRegionName
            ORDER BY avg_srb ASC`; 
        const result = await pool.query(sql, [region, year]);
        if(result.rows.length === 0) return res.send('No data found.');
        let html = `<h4>Avg SRB in Year ${year}</h4><table class="table"><tr><th>Sub-Region</th><th>Avg SRB</th></tr>`;
        result.rows.forEach(r => html += `<tr><td>${r.subregionname}</td><td>${parseFloat(r.avg_srb).toFixed(2)}</td></tr>`);
        res.send(html + '</table>');
    } catch (e) { res.send('Error: ' + e.message); }
});

// Req 4: 關鍵字搜尋 -> 顯示匹配國家最新 SRB
app.post('/req4', async (req, res) => {
    const { keyword } = req.body;
    try {
        const sql = `
            SELECT c.CountryName, s.SRB, s.Year 
            FROM Countries c 
            JOIN AnnualSRB s ON c.CountryCode = s.CountryCode 
            WHERE c.CountryName ILIKE $1 
            AND s.Year = (SELECT MAX(Year) FROM AnnualSRB WHERE CountryCode = c.CountryCode)
            ORDER BY c.CountryName`;
        const result = await pool.query(sql, [`%${keyword}%`]);
        if(result.rows.length === 0) return res.send('No matches.');
        let html = '<ul>';
        result.rows.forEach(r => html += `<li><b>${r.countryname}</b>: ${r.srb} (${r.year})</li>`);
        res.send(html + '</ul>');
    } catch (e) { res.send('Error: ' + e.message); }
});

// Req 5: 新增下一年度資料 (Insert)
app.post('/req5', async (req, res) => {
    const { country_code } = req.body;
    try {
        // 1. 找出該國最新資料
        const maxRes = await pool.query('SELECT Year, SRB FROM AnnualSRB WHERE CountryCode = $1 ORDER BY Year DESC LIMIT 1', [country_code]);
        if(maxRes.rows.length === 0) return res.send('No existing data for this country to base on.');
        
        const lastYear = maxRes.rows[0].year;
        const lastSRB = maxRes.rows[0].srb; // 預設使用去年的值，或可讓使用者輸入
        const nextYear = lastYear + 1;

        // 2. 插入新資料 (這裡為了簡化，直接複製去年的 SRB，實務上可讓使用者輸入)
        await pool.query('INSERT INTO AnnualSRB (CountryCode, Year, SRB) VALUES ($1, $2, $3)', [country_code, nextYear, lastSRB]);
        res.send(`✅ Added Record: Year ${nextYear} (SRB: ${lastSRB})`);
    } catch (e) { res.send('Error (maybe already exists): ' + e.message); }
});

// Req 6: 更新資料 (Update)
app.post('/req6', async (req, res) => {
    const { country_code, year, new_srb } = req.body;
    try {
        await pool.query('UPDATE AnnualSRB SET SRB = $3 WHERE CountryCode = $1 AND Year = $2', [country_code, year, new_srb]);
        res.send(`✅ Updated ${country_code} for Year ${year} to SRB ${new_srb}`);
    } catch (e) { res.send('Error: ' + e.message); }
});

// Req 7: 範圍刪除 (Delete Range)
app.post('/req7', async (req, res) => {
    const { country_code, start_year, end_year } = req.body;
    try {
        const result = await pool.query('DELETE FROM AnnualSRB WHERE CountryCode = $1 AND Year BETWEEN $2 AND $3', [country_code, start_year, end_year]);
        res.send(`✅ Deleted ${result.rowCount} records for ${country_code} between ${start_year} and ${end_year}`);
    } catch (e) { res.send('Error: ' + e.message); }
});

// Req 8: 自選功能 (顯示某年度 SRB 最高的前 10 個國家) - 修正版
app.post('/req8', async (req, res) => {
    const { year } = req.body;
    console.log('Req8 received year:', year); // 這是除錯訊息，會顯示在終端機

    if (!year) {
        return res.send('<span style="color:red;">Please select a year first.</span>');
    }

    try {
        const sql = `
            SELECT c.CountryName, a.SRB 
            FROM Countries c
            JOIN AnnualSRB a ON c.CountryCode = a.CountryCode
            WHERE a.Year = $1
            ORDER BY a.SRB DESC
            LIMIT 10`;
        
        // 強制轉換年份為整數，確保 SQL 讀取正確
        const result = await pool.query(sql, [parseInt(year)]);
        
        if(result.rows.length === 0) return res.send('No data found for this year.');
        
        let html = `<ol class="result-list">`;
        result.rows.forEach((r, index) => {
            // 使用 parseFloat 確保 SRB 顯示美觀
            html += `<li style="padding: 5px; border-bottom: 1px solid #eee;">
                        <strong>${index + 1}. ${r.countryname}</strong>: 
                        <span style="color: #28a745; font-weight: bold;">${parseFloat(r.srb).toFixed(3)}</span>
                     </li>`;
        });
        res.send(html + '</ol>');
    } catch (e) { 
        console.error('Req8 Error:', e);
        res.send('Error: ' + e.message); 
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));