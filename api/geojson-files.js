//vercle
import { geojsonFilesHandler } from '../server/geojsonFilesHandler.js';

export default function(req, res) {
    // 设置 CORS 响应头
    res.setHeader('Access-Control-Allow-Origin', '*'); // 这允许来自所有源的请求
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); // 指定允许的HTTP方法
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // 指定允许的头部

    // 检查预检请求
    if (req.method === 'OPTIONS') {
        // 对于OPTIONS预检请求，返回成功状态码
        res.status(200).end();
        return;
    }

    // 对于非OPTIONS请求，调用你的处理函数
    return geojsonFilesHandler(req, res);
}
