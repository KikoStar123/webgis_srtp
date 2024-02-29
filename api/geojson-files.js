//允许vercel使用源
import { geojsonFilesHandler } from '../server/geojsonFilesHandler.js';

export default function(req, res) {
    return geojsonFilesHandler(req, res);
}
