<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div class="draggable-select" ref="draggableSelect">
            <ElSelect v-model="selectedBlockGeoJSON" @change="locateGeoJSON('block')"
                class="geojson-selector block-selector" placeholder="请选择地块数据" filterable>
                <ElOption v-for="fileObj in blockGeojsonFiles" :key="fileObj.geojson"
                    :label="fileObj.geojson.replace('.geojson', '')" :value="fileObj.geojson">
                </ElOption>
            </ElSelect>
            <ElSelect v-model="selectedIsochroneGeoJSON" @change="locateGeoJSON('isochrone')"
                class="geojson-selector isochrone-selector" placeholder="请选择等时圈数据" filterable>
                <ElOption v-for="fileObj in isochroneGeojsonFiles" :key="fileObj.geojson"
                    :label="fileObj.geojson.replace('.geojson', '')" :value="fileObj.geojson">
                </ElOption>
            </ElSelect>
            <ElSelect v-model="selectedColorCriteria" @change="updateBlockColors" class="color-criteria-selector"
                placeholder="请选择着色标准" filterable>
                <ElOption label="容积率" value="floorAreaRatio"></ElOption>
                <ElOption label="建筑密度" value="buildingDensity"></ElOption>
                <ElOption label="建筑高度" value="avgHeight"></ElOption>
            </ElSelect>
        </div>
    </div>
</template>

<script setup>
import { Map, MapStyle, config } from '@maptiler/sdk';
import { shallowRef, onMounted, onUnmounted, ref } from 'vue';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import maplibregl from 'maplibre-gl';
import { ElSelect, ElOption } from 'element-plus';
import 'element-plus/dist/index.css';

config.apiKey = 'nMI0OagfwxzpRVopD5sR';
config.unit = 'metric'; // 比例尺公制单位

const mapContainer = shallowRef(null);
const map = shallowRef(null);
const isochroneGeojsonFiles = ref([]); // 存储等时圈数据对象数组
const blockGeojsonFiles = ref([]); // 存储地块数据对象数组
const selectedIsochroneGeoJSON = ref(''); // 选择的等时圈GeoJSON文件
const selectedBlockGeoJSON = ref(''); // 选择的地块GeoJSON文件
const selectedColorCriteria = ref(''); // 选择的着色标准
const draggableSelect = ref(null); // 拖动选择框
const backendUrl = import.meta.env.VITE_BACKEND_URL; // 调用全局分配的域名地址
const layerCsvContentMap = new window.Map(); // 全局csv描述信息存储Map
const lockedLayerId = ref(null); // 默认没有图层被锁定，用于存储图层锁定状态
const layerConfigs = [
    {
        id: 'geojson-layer-fill',
        type: 'fill',
        source: 'geojson',
        paint: {
            'fill-color': '#90EE90', // 浅绿色
            'fill-opacity': 0.8 // 透明度
        }
    },
    {
        id: 'geojson-layer-line',
        type: 'line',
        source: 'geojson',
        paint: {
            'line-color': '#006400', // 深绿色
            'line-width': 2,
            'line-opacity': 0.8 // 透明度
        }
    }
];

onMounted(async () => {
    const initialState = { lng: 116.2, lat: 39.5, zoom: 7 };
    map.value = new Map({
        container: mapContainer.value,
        style: MapStyle.STREETS,
        center: [initialState.lng, initialState.lat],
        zoom: initialState.zoom,
        minimap: {
            style: MapStyle.BASIC,
            containerStyle: {
                width: '200px',
                height: '150px',
                bottom: '10px',
                right: '10px'
            }
        },
        scaleControl: true //比例尺
    });

    try {
        const responseIsochrone = await fetch(`${backendUrl}/api/geojson-files/Nanjing`);
        if (!responseIsochrone.ok) {
            throw new Error('Failed to fetch isochrone geojson and csv files');
        }
        const directoriesIsochrone = await responseIsochrone.json();
        console.log("Isochrone directories:", directoriesIsochrone);

        isochroneGeojsonFiles.value = directoriesIsochrone
            .filter(dir => dir.directory !== 'block')
            .flatMap(dir =>
                dir.files.filter(file => file.endsWith('.geojson')).map(geojsonFile => ({
                    geojson: geojsonFile,
                    csv: dir.files.find(csvFile => csvFile === geojsonFile.replace('.geojson', '站点信息.csv')),
                    directory: dir.directory // 存储目录名称
                }))
            );
        console.log("Isochrone files:", isochroneGeojsonFiles.value);

        const responseBlock = await fetch(`${backendUrl}/api/geojson-files/Nanjing/block`);
        if (!responseBlock.ok) {
            throw new Error('Failed to fetch block geojson and csv files');
        }
        const blockFiles = await responseBlock.json();
        console.log("Block files:", blockFiles);

        blockGeojsonFiles.value = blockFiles.files.filter(file => file.endsWith('.geojson')).map(geojsonFile => ({
            geojson: geojsonFile,
            csv: blockFiles.files.find(csvFile => csvFile === geojsonFile.replace('.geojson', '站点信息.csv')),
            directory: 'block' // 存储目录名称
        }));
        console.log("Block geojson files:", blockGeojsonFiles.value);
    } catch (error) {
        console.error('Error fetching geojson and csv files:', error);
    }

    initDraggableSelect();//拖动选择框
});

onUnmounted(() => {
    map.value?.remove();
});

function initDraggableSelect() {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseDown = (e) => {
        isDragging = true;
        const computedStyle = window.getComputedStyle(draggableSelect.value);
        const currentLeft = parseInt(computedStyle.left, 10) || 0;
        const currentTop = parseInt(computedStyle.top, 10) || 0;
        offsetX = e.clientX - currentLeft;
        offsetY = e.clientY - currentTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        draggableSelect.value.style.left = `${x}px`;
        draggableSelect.value.style.top = `${y}px`;
    };

    const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    draggableSelect.value.addEventListener('mousedown', onMouseDown);
}

const calculateCenter = (features) => {
    let x = 0, y = 0, count = 0;
    features.forEach(feature => {
        let coordinates = [];
        if (feature.geometry.type === 'Polygon') {
            coordinates = feature.geometry.coordinates[0];
        } else if (feature.geometry.type === 'Point') {
            coordinates = [feature.geometry.coordinates];
        }
        coordinates.forEach(coord => {
            x += coord[0];
            y += coord[1];
            count++;
        });
    });

    return count > 0 ? [x / count, y / count] : null;
};

const locateGeoJSON = async (type) => {
    const selectedFilename = type === 'isochrone' ? selectedIsochroneGeoJSON.value : selectedBlockGeoJSON.value;
    try {
        const fileObj = type === 'isochrone'
            ? isochroneGeojsonFiles.value.find(item => item.geojson === selectedFilename)
            : blockGeojsonFiles.value.find(item => item.geojson === selectedFilename);
        if (!fileObj) {
            throw new Error(`File ${selectedFilename} not found in geojsonFiles array.`);
        }

        const geojsonUrl = `${backendUrl}/api/geojson-files/Nanjing/${type === 'isochrone' ? encodeURIComponent(fileObj.directory) : 'block'}/${encodeURIComponent(fileObj.geojson)}`;
        console.log(`Fetching GeoJSON data from ${geojsonUrl}`); // 添加调试输出
        const response = await fetch(geojsonUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${geojsonUrl}: ${response.statusText}`);
        }
        const geojsonData = await response.json();

        await addGeoJSONLayers(geojsonData, fileObj.geojson);

        const center = calculateCenter(geojsonData.features || []);
        if (center) {
            map.value.flyTo({
                center: center,
                zoom: 13,
                essential: true
            });
        } else {
            console.error(`无法定位到 ${selectedFilename}，因为中心坐标无效`);
        }
    } catch (error) {
        console.error(`Error locating ${selectedFilename}:`, error);
    }
};

async function addGeoJSONLayers(geojsonData, sourceId) {
    if (!map.value) return;
    let currentPopup;

    console.log(`Adding GeoJSON layers for source ${sourceId}`); // 添加调试输出
    if (!map.value.getSource(sourceId)) {
        map.value.addSource(sourceId, {
            type: 'geojson',
            data: geojsonData
        });
    } else {
        map.value.getSource(sourceId).setData(geojsonData);
    }

    const colorCriteria = selectedColorCriteria.value;

    layerConfigs.forEach(config => {
        const layerConfig = {
            ...config,
            source: sourceId,
            id: `${sourceId}-${config.id}`,
            layout: { visibility: 'visible' }
        };

        if (colorCriteria && config.id === 'geojson-layer-fill') {
            layerConfig.paint['fill-color'] = [
                'interpolate',
                ['linear'],
                ['get', colorCriteria],
                ...(colorCriteria === 'floorAreaRatio' ? getFloorAreaRatioColors() :
                    colorCriteria === 'buildingDensity' ? getBuildingDensityColors() : getBuildingHeightColors())
            ];
        }

        if (!map.value.getLayer(layerConfig.id)) {
            map.value.addLayer(layerConfig);
        } else {
            map.value.setPaintProperty(layerConfig.id, 'fill-color', layerConfig.paint['fill-color']);
        }

        if (config.type !== 'symbol') {
            map.value.on('contextmenu', layerConfig.id, (e) => {
                e.preventDefault();
                if (currentPopup) {
                    currentPopup.remove();
                }
                const properties = e.features[0].properties;
                const coordinates = e.lngLat;
                const layerId = `${sourceId}-${config.id}`;
                const csvHtmlContent = layerCsvContentMap.get(layerId);
                currentPopup = new maplibregl.Popup()
                    .setLngLat([coordinates.lng, coordinates.lat])
                    .setHTML(csvHtmlContent)
                    .addTo(map.value);
            });
        }
    });

    const fileObj = isochroneGeojsonFiles.value.find(item => item.geojson === sourceId) || blockGeojsonFiles.value.find(item => item.geojson === sourceId);
    if (fileObj && fileObj.csv) {
        const csvUrl = `${backendUrl}/api/geojson-files/Nanjing/${fileObj.directory ? encodeURIComponent(fileObj.directory) : 'block'}/${encodeURIComponent(fileObj.csv)}`;
        try {
            console.log(`Fetching CSV data from ${csvUrl}`); // 添加调试输出
            const csvResponse = await fetch(csvUrl);
            if (!csvResponse.ok) throw new Error(`Failed to fetch ${csvUrl}: ${csvResponse.statusText}`);
            const csvText = await csvResponse.text();
            const pointsData = parseCSVToGeoJSON(csvText);
            const csvHtmlContent = formatCSVAsHTML(csvText);
            layerConfigs.forEach(config => {
                const layerId = `${sourceId}-${config.id}`;
                layerCsvContentMap.set(layerId, csvHtmlContent);
            });

            map.value.loadImage(`${backendUrl}/static/images/underground2.png`, async (error, image) => {
                if (error) return console.error('Error loading image:', error);
                if (!map.value.hasImage('custom-pin')) map.value.addImage('custom-pin', image);

                if (!map.value.getSource(`${sourceId}-points`)) {
                    map.value.addSource(`${sourceId}-points`, { type: 'geojson', data: pointsData });
                } else {
                    map.value.getSource(`${sourceId}-points`).setData(pointsData);
                }

                if (!map.value.getLayer(`${sourceId}-points-layer`)) {
                    map.value.addLayer({
                        id: `${sourceId}-points-layer`,
                        type: 'symbol',
                        source: `${sourceId}-points`,
                        layout: {
                            'icon-image': 'custom-pin',
                            'icon-size': 0.12,
                            'icon-anchor': 'bottom'
                        },
                        minzoom: 7,
                    });
                }

                map.value.on('click', `${sourceId}-points-layer`, (e) => {
                    const features = map.value.queryRenderedFeatures(e.point, { layers: [`${sourceId}-points-layer`] });
                    if (features.length > 0) {
                        layerConfigs.forEach(config => {
                            const targetLayerId = `${sourceId}-${config.id}`;
                            toggleLayerVisibility(targetLayerId, true);
                        });
                    }
                });
            });

        } catch (error) {
            console.error(`Error loading or parsing CSV from ${fileObj.csv}:`, error);
        }
    }
}

function parseCSVToGeoJSON(csvText) {
    const lines = csvText.trim().split('\n').slice(1);

    const features = lines.map(line => {
        const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

        const regex = /\(([^,]+),\s*([^)]+)\)/;
        const match = columns[1].match(regex);
        if (!match) return null;

        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (isNaN(lat) || isNaN(lng)) return null;

        return {
            type: 'Feature',
            properties: {
                name: columns[0].replace(/"/g, ''),
                exits: parseInt(columns[2], 10),
            },
            geometry: {
                type: 'Point',
                coordinates: [lng, lat]
            }
        };
    }).filter(feature => feature != null);

    return {
        type: "FeatureCollection",
        features
    };
}

function formatCSVAsHTML(csvText) {
    const rows = csvText.trim().split('\n').map(row => {
        let match;
        const cells = [];
        const regex = /(".*?"|[^",]+)(,|$)/g;
        while ((match = regex.exec(row)) !== null) {
            let cell = match[1].replace(/^"|"$/g, '');
            cells.push(cell);
        }
        return cells;
    });

    const columns = rows[0] ? rows[0].map((_, i) => rows.map(row => row[i])) : [];

    const htmlLines = columns.map(column => {
        return `<p>${column.join(':')}</p>`;
    }).join('');

    return htmlLines;
}

function getFloorAreaRatioColors() {
    return [
        0.0, 'rgb(250,209,209)',
        1.0, 'rgb(246,162,163)',
        5.0, 'rgb(241,116,116)',
        10.0, 'rgb(238,69,68)',
        15.0, 'rgb(233,32,24)',
        1000.0, 'rgb(255,255,255)' // 用于定义最大值以上的颜色
    ];
}

function getBuildingDensityColors() {
    return [
        0.0, 'rgb(245,230,208)',
        0.2, 'rgb(235,205,160)',
        0.4, 'rgb(225,179,111)',
        0.6, 'rgb(215,152,62)',
        0.8, 'rgb(205,127,16)',
        1.0, 'rgb(205,127,16)',
        10.0, 'rgb(255,255,255)' // 用于定义最大值以上的颜色
    ];
}

function getBuildingHeightColors() {
    return [
        0.0, 'rgb(253,252,230)',
        10.0, 'rgb(250,249,205)',
        30.0, 'rgb(247,244,168)',
        50.0, 'rgb(243,240,129)',
        100.0, 'rgb(241,235,90)',
        150.0, 'rgb(238,230,50)',
        200.0, 'rgb(235,224,10)',
        1000.0, 'rgb(255,255,255)' // 用于定义最大值以上的颜色
    ];
}

function toggleLayerVisibility(layerId, isLocking = false) {
    if (!map.value) return;

    if (lockedLayerId.value === layerId && !isLocking) {
        console.log(`图层 "${layerId}" 当前被锁定，无法更改其可见性。`);
        return;
    }

    const layerType = map.value.getLayer(layerId).type;
    const opacityProperty = layerType === 'fill' ? 'fill-opacity' : (layerType === 'line' ? 'line-opacity' : null);

    if (!opacityProperty) {
        console.error(`图层 "${layerId}" 类型不是填充或线图层。`);
        return;
    }

    const visibility = map.value.getLayoutProperty(layerId, 'visibility');
    const currentOpacity = map.value.getPaintProperty(layerId, opacityProperty);

    if (visibility === 'visible' && currentOpacity > 0) {
        changeLayerOpacity(layerId, 0.4, 0, layerType);
        if (isLocking) {
            lockedLayerId.value = null; // 解锁图层
        }
    } else if (visibility !== 'visible' || currentOpacity === 0) {
        map.value.setLayoutProperty(layerId, 'visibility', 'visible');
        changeLayerOpacity(layerId, 0, 0.4, layerType);
        if (isLocking) {
            lockedLayerId.value = layerId; // 锁定图层
        }
    }
}

function changeLayerOpacity(layerId, startOpacity, endOpacity, layerType, duration = 500) {
    const opacityProperty = layerType === 'fill' ? 'fill-opacity' : 'line-opacity';

    if (startOpacity < endOpacity) {
        map.value.setLayoutProperty(layerId, 'visibility', 'visible');
    }

    const step = (endOpacity - startOpacity) / (duration / 10);
    let currentOpacity = startOpacity;

    function stepFunction() {
        if ((step > 0 && currentOpacity < endOpacity) || (step < 0 && currentOpacity > endOpacity)) {
            currentOpacity += step;
            const safeOpacity = Math.max(0, currentOpacity);
            map.value.setPaintProperty(layerId, opacityProperty, safeOpacity);
            requestAnimationFrame(stepFunction);
        } else {
            const finalOpacity = Math.max(0, endOpacity);
            map.value.setPaintProperty(layerId, opacityProperty, finalOpacity);
            if (endOpacity === 0) {
                map.value.setLayoutProperty(layerId, 'visibility', 'none');
            }
        }
    }

    stepFunction();
}

const updateBlockColors = async () => {
    blockGeojsonFiles.value.forEach(async (fileObj) => {
        const geojsonUrl = `${backendUrl}/api/geojson-files/Nanjing/block/${encodeURIComponent(fileObj.geojson)}`;
        try {
            console.log(`Updating block colors from ${geojsonUrl}`);
            const geojsonResponse = await fetch(geojsonUrl);
            if (!geojsonResponse.ok) {
                throw new Error(`Failed to fetch GeoJSON data from ${geojsonUrl}`);
            }
            const geojsonData = await geojsonResponse.json();
            await addGeoJSONLayers(geojsonData, fileObj.geojson);
        } catch (error) {
            console.error(`Error updating block colors from ${fileObj.geojson}:`, error);
        }
    });
};
</script>

<style scoped>
.map-wrap {
    position: relative;
    width: 100%;
    height: calc(100vh - 77px);
}

.map {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
}

.geojson-selector {
    position: absolute;
    left: 10px;
    z-index: 1000;
    width: 240px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    background-color: #ffffff;
    color: #333;
}

.geojson-selector.isochrone-selector {
    top: 10px;
    width: 300px;
}

.geojson-selector.block-selector {
    top: 50px;
    width: 300px;
}

.color-criteria-selector {
    top: 90px;
    left: 10px;
    width: 300px;
}

.el-select .el-input {
    border-radius: 8px;
}

.el-select-dropdown {
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.draggable-select {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    cursor: grab;
}
</style>
