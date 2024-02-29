import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GEOJSON_DIR = path.join(__dirname, '..', 'public', 'geojson');

app.get('/api/geojson-files', (req, res) => {
  fs.readdir(GEOJSON_DIR, (err, files) => {
    if (err) {
      res.status(500).send('Error reading geojson directory');
      return;
    }
    const geojsonFiles = files.filter(file => file.endsWith('.geojson'));
    res.json(geojsonFiles);
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
