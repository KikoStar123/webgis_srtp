/*
 * @Author: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @Date: 2024-02-29 23:41:55
 * @LastEditors: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @LastEditTime: 2024-03-01 12:10:25
 * @FilePath: \webgis_srtp\server\geojsonFilesHandler.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 假设URL路径参数中包含城市名，例如 "/geojsonFiles/{cityName}"
export const geojsonFilesHandler = (req, res) => {
    // 从请求参数中获取城市名
    const cityName = req.params.cityName; // 确保路由配置正确以解析城市名参数
    // 构建指向特定城市的xxx_output文件夹的路径
    const targetDir = path.join(__dirname, '..', 'public', 'city', cityName);

    fs.readdir(targetDir, { withFileTypes: true }, (err, entries) => {
        if (err) {
            res.status(500).send('Error reading city directory');
            return;
        }

        // 过滤出所有的xxx_output目录
        const outputDirs = entries.filter(entry => entry.isDirectory() && entry.name.endsWith('_output'));

        let results = [];

        // 遍历每个xxx_output目录
        outputDirs.forEach(dir => {
            const outputDirPath = path.join(targetDir, dir.name);
            // 读取每个xxx_output目录内的文件
            const files = fs.readdirSync(outputDirPath).filter(file => file.endsWith('.geojson') || file.endsWith('站点信息.csv'));

            // 将结果存储在数组中
            results.push({
                directory: dir.name,
                files: files
            });
        });

        // 返回结果
        res.json(results);
    });
};
