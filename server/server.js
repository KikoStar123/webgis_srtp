import express from 'express';
import cors from 'cors';
import { geojsonFilesHandler } from './geojsonFilesHandler.js'; 

const app = express();
const PORT = 3000;

app.use(cors());//允许跨源
app.get('/api/geojson-files', geojsonFilesHandler);// 路由配置
app.listen(PORT, () => {// 启动服务器
  console.log(`Server is running on http://localhost:${PORT}`);
});
