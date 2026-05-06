const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
    if (!process.env.MYSQL_URL) {
        console.error("❌ ERROR: Please set MYSQL_URL in your .env file first!");
        console.error("Example: MYSQL_URL=mysql://root:password@host:port/railway");
        process.exit(1);
    }

    console.log("Connecting to Railway MySQL...");
    const separator = process.env.MYSQL_URL.includes('?') ? '&' : '?';
    const connection = await mysql.createConnection(process.env.MYSQL_URL + separator + 'multipleStatements=true');
    console.log("✅ Connected successfully!");

    const sqlContent = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    
    // The Railway Web UI fails on DELIMITER commands, so we will parse and execute them manually here in Node.
    const sections = sqlContent.split('DELIMITER //');
    
    try {
        // 1. Run everything before the first DELIMITER (Tables, Views)
        console.log("⏳ Creating Tables and Views...");
        if (sections[0].trim()) {
            await connection.query(sections[0]);
        }

        // 2. Run the PL/SQL block
        if (sections.length > 1) {
            console.log("⏳ Creating PL/SQL Procedures, Functions, and Triggers...");
            
            // The second section contains all our PL/SQL separated by '//'
            const plsqlBlock = sections[1];
            const plsqlStatements = plsqlBlock.split('//');
            
            for (let stmt of plsqlStatements) {
                // Remove the 'DELIMITER ;' from the last part
                stmt = stmt.replace('DELIMITER ;', '');
                stmt = stmt.trim();
                
                if (stmt) {
                    await connection.query(stmt);
                }
            }
        }
        
        console.log("🎉 SUCCESS! All tables, views, procedures, and seed data have been generated in your Railway database!");
    } catch (e) {
        console.error("❌ Error executing script:", e.message);
    } finally {
        await connection.end();
    }
}

run();
