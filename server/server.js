import express from 'express';
import cors from 'cors';
import { geojsonFilesHandler, geojsonFilesInDirectoryHandler, geojsonFileContentHandler } from './geojsonFilesHandler.js';

const app = express();
const PORT = 3000;
app.use(cors()); // 允许跨源
// 配置静态文件服务
app.use('/static', express.static('public'));
app.get('/api/geojson-files/:cityName', geojsonFilesHandler); // 路由配置
app.get('/api/geojson-files/:cityName/:subDir', geojsonFilesInDirectoryHandler); // 新增路由配置
app.get('/api/geojson-files/:cityName/:subDir/:fileName', geojsonFileContentHandler); // 新增路由配置，用于获取单个文件内容
app.listen(PORT, () => { // 启动服务器
  console.log(`Server is running on http://localhost:${PORT}`);
});
