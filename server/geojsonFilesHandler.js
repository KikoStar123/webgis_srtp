//后端：遍历读取geojson文件名
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GEOJSON_DIR = path.join(__dirname, '..', 'public', 'geojson');

export const geojsonFilesHandler = (req, res) => {
    fs.readdir(GEOJSON_DIR, (err, files) => {
        if (err) {
            res.status(500).send('Error reading geojson directory');
            return;
        }
        const geojsonFiles = files.filter(file => file.endsWith('.geojson'));
        res.json(geojsonFiles);
    });
};

