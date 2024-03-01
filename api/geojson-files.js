//vercle适配
import { geojsonFilesHandler } from '../server/geojsonFilesHandler.js';

export default function(req, res) {
    // 设置 CORS 响应头，允许所有源的请求
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 对于 OPTIONS 请求（预检请求），直接返回 200 状态码
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 从查询字符串中提取 cityName 参数
    const { cityName } = req.query;

    // 如果 cityName 参数不存在，返回 400 错误
    if (!cityName) {
        return res.status(400).json({ error: 'City name is required as a query parameter.' });
    }

    // 由于 geojsonFilesHandler 预期接收 cityName 作为 req.params 的一部分，
    // 我们创建一个新的请求对象 reqModified 来模拟这个行为
    const reqModified = {
        ...req,
        params: { cityName }
    };

    // 使用修改后的请求对象和原始的响应对象调用 geojsonFilesHandler 函数
    geojsonFilesHandler(reqModified, res);
}
