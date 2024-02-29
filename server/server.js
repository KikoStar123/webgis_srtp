import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import geojsonFilesHandler from './api/geojson-files.js';

const app = express();
const PORT = 3000;

app.use(cors());

// 转换 __dirname 来兼容 ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 提供 public 目录下的静态文件服务
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/geojson-files', geojsonFilesHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


