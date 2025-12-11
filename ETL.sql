-- ETL.sql

-- 1. 建立暫存表 (Staging Tables) - 用來暫存 CSV 原始資料
DROP TABLE IF EXISTS staging_facts CASCADE;
CREATE TABLE staging_facts (
    Entity TEXT,
    Code TEXT,
    Year INT,
    SRB NUMERIC,
    OWID TEXT
);

DROP TABLE IF EXISTS staging_regions CASCADE;
CREATE TABLE staging_regions (
    name TEXT,
    alpha_2 TEXT,
    alpha_3 TEXT,
    country_code INT,
    iso_3166_2 TEXT,
    region TEXT,
    sub_region TEXT,
    intermediate_region TEXT,
    region_code INT,
    sub_region_code INT,
    intermediate_region_code INT
);

-- 2. 建立正式表格 (5 Entities)

-- Entity 1: Regions
DROP TABLE IF EXISTS Regions CASCADE;
CREATE TABLE Regions (
    RegionCode INT PRIMARY KEY,
    RegionName TEXT NOT NULL
);

-- Entity 2: SubRegions
DROP TABLE IF EXISTS SubRegions CASCADE;
CREATE TABLE SubRegions (
    SubRegionCode INT PRIMARY KEY,
    SubRegionName TEXT NOT NULL,
    RegionCode INT NOT NULL,
    FOREIGN KEY (RegionCode) REFERENCES Regions(RegionCode)
);

-- Entity 3: IntermediateRegions (第 5 個實體)
DROP TABLE IF EXISTS IntermediateRegions CASCADE;
CREATE TABLE IntermediateRegions (
    IntermediateRegionCode INT PRIMARY KEY,
    IntermediateRegionName TEXT NOT NULL,
    SubRegionCode INT NOT NULL,
    FOREIGN KEY (SubRegionCode) REFERENCES SubRegions(SubRegionCode)
);

-- Entity 4: Countries
DROP TABLE IF EXISTS Countries CASCADE;
CREATE TABLE Countries (
    CountryCode CHAR(3) PRIMARY KEY, -- alpha-3
    Alpha2Code CHAR(2),
    NumericCode INT,
    CountryName TEXT NOT NULL,
    ISO3166_2 TEXT,
    SubRegionCode INT NOT NULL,
    IntermediateRegionCode INT, -- 允許為空 (Nullable)
    FOREIGN KEY (SubRegionCode) REFERENCES SubRegions(SubRegionCode),
    FOREIGN KEY (IntermediateRegionCode) REFERENCES IntermediateRegions(IntermediateRegionCode)
);

-- Entity 5: AnnualSRB
DROP TABLE IF EXISTS AnnualSRB CASCADE;
CREATE TABLE AnnualSRB (
    ID SERIAL PRIMARY KEY,
    CountryCode CHAR(3) NOT NULL,
    Year INT NOT NULL,
    SRB NUMERIC,
    FOREIGN KEY (CountryCode) REFERENCES Countries(CountryCode),
    CONSTRAINT uq_country_year UNIQUE(CountryCode, Year)
);

-- 3. ETL 轉換邏輯 (從暫存表 -> 正式表)

-- 載入 Regions
INSERT INTO Regions (RegionCode, RegionName)
SELECT DISTINCT region_code, region FROM staging_regions
WHERE region_code IS NOT NULL
ON CONFLICT (RegionCode) DO NOTHING;

-- 載入 SubRegions
INSERT INTO SubRegions (SubRegionCode, SubRegionName, RegionCode)
SELECT DISTINCT sub_region_code, sub_region, region_code FROM staging_regions
WHERE sub_region_code IS NOT NULL
ON CONFLICT (SubRegionCode) DO NOTHING;

-- 載入 IntermediateRegions (只載入有資料的)
INSERT INTO IntermediateRegions (IntermediateRegionCode, IntermediateRegionName, SubRegionCode)
SELECT DISTINCT intermediate_region_code, intermediate_region, sub_region_code 
FROM staging_regions
WHERE intermediate_region_code IS NOT NULL
ON CONFLICT (IntermediateRegionCode) DO NOTHING;

-- 載入 Countries
INSERT INTO Countries (CountryCode, Alpha2Code, NumericCode, CountryName, ISO3166_2, SubRegionCode, IntermediateRegionCode)
SELECT DISTINCT 
    alpha_3, alpha_2, country_code, name, iso_3166_2, sub_region_code, intermediate_region_code
FROM staging_regions
WHERE alpha_3 IS NOT NULL AND sub_region_code IS NOT NULL
ON CONFLICT (CountryCode) DO NOTHING;

-- 載入 AnnualSRB (排除錯誤資料)
INSERT INTO AnnualSRB (CountryCode, Year, SRB)
SELECT f.Code, f.Year, f.SRB
FROM staging_facts f
JOIN Countries c ON f.Code = c.CountryCode -- 確保國家代碼存在於 Countries 表
WHERE f.SRB IS NOT NULL AND f.Code IS NOT NULL
ON CONFLICT (CountryCode, Year) DO NOTHING;

-- 4. 清理暫存表
DROP TABLE staging_facts;
DROP TABLE staging_regions;