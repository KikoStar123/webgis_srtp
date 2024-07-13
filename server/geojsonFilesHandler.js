import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const geojsonFilesHandler = (req, res) => {
    const cityName = req.params.cityName;
    const targetDir = path.join(__dirname, '..', 'public', 'city', cityName);

    console.log(`Reading directory: ${targetDir}`);

    fs.readdir(targetDir, { withFileTypes: true }, (err, entries) => {
        if (err) {
            console.error(`Error reading directory: ${err.message}`);
            res.status(500).send('Error reading city directory');
            return;
        }

        const directories = entries.filter(entry => entry.isDirectory());

        let results = [];

        directories.forEach(dir => {
            const dirPath = path.join(targetDir, dir.name);
            console.log(`Reading sub-directory: ${dirPath}`);
            const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.geojson') || file.endsWith('.csv'));

            results.push({
                directory: dir.name,
                files: files
            });
        });

        console.log(`Found directories and files: ${JSON.stringify(results)}`);
        res.json(results);
    });
};

export const geojsonFilesInDirectoryHandler = (req, res) => {
    const { cityName, subDir } = req.params;
    const targetDir = path.join(__dirname, '..', 'public', 'city', cityName, subDir);

    console.log(`Reading directory: ${targetDir}`);

    fs.readdir(targetDir, (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${err.message}`);
            res.status(500).send('Error reading directory');
            return;
        }

        const geojsonFiles = files.filter(file => file.endsWith('.geojson') || file.endsWith('.csv'));

        console.log(`Found files: ${JSON.stringify(geojsonFiles)}`);
        res.json({ files: geojsonFiles });
    });
};

export const geojsonFileContentHandler = (req, res) => {
    const { cityName, subDir, fileName } = req.params;
    const filePath = path.join(__dirname, '..', 'public', 'city', cityName, subDir, fileName);

    console.log(`Reading file: ${filePath}`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading file: ${err.message}`);
            res.status(500).send('Error reading file');
            return;
        }

        if (fileName.endsWith('.geojson')) {
            res.json(JSON.parse(data));
        } else if (fileName.endsWith('.csv')) {
            res.send(data);
        } else {
            res.status(400).send('Unsupported file type');
        }
    });
};
