//vercle适配
import { geojsonFilesHandler } from '../server/geojsonFilesHandler.js';

export default function(req, res) {
    // 设置 CORS 响应头
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); 
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); 

    // 检查预检请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 从查询字符串中提取 cityName 参数
    const { cityName } = req.query;

    // 检查 cityName 是否存在
    if (!cityName) {
        res.status(400).json({ error: 'City name is required' });
        return;
    }

    // 创建一个模拟的 req 对象，包含 cityName
    const reqModified = {
        ...req,
        params: { cityName }
    };

    // 调用原有的处理器函数，传入模拟的 req 对象和原始的 res 对象
    return geojsonFilesHandler(reqModified, res);
}

