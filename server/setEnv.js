//设置.env.local的脚本，实现自动获取vite工具自动生成的network局域网地址
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const interfaces = os.networkInterfaces();
const envPath = path.join(__dirname, '../.env.local'); 

let lanUrl = '';

for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
        if ('IPv4' === iface.family && !iface.internal) {
            lanUrl = `http://${iface.address}:3000`;
            break;
        }
    }
}

// 更新环境变量文件
if (lanUrl) {
    const content = `VITE_BACKEND_URL=${lanUrl}\n`;
    fs.writeFileSync(envPath, content);
    console.log(`Local development backend URL set to ${lanUrl}`);
}
