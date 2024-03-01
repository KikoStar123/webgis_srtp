/*
 * @Author: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @Date: 2024-02-29 21:47:30
 * @LastEditors: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @LastEditTime: 2024-03-01 13:10:59
 * @FilePath: \webgis_srtp\server\server.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import express from 'express';
import cors from 'cors';
import { geojsonFilesHandler } from './geojsonFilesHandler.js'; 

const app = express();
const PORT = 3000;
app.use(cors());//允许跨源
// 配置静态文件服务
app.use('/static', express.static('public'));
app.get('/api/geojson-files/:cityName', geojsonFilesHandler);// 路由配置
app.listen(PORT, () => {// 启动服务器
  console.log(`Server is running on http://localhost:${PORT}`);
});
