<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div class="draggable-select" ref="draggableSelect">
            <div class="selector-container">
                <ElSelect v-model="selectedIsochroneGeoJSON" @change="loadIsochroneAndBlocks"
                    class="geojson-selector isochrone-selector" placeholder="请选择等时圈数据" filterable>
                    <ElOption v-for="fileObj in isochroneGeojsonFiles" :key="fileObj.key"
                        :label="fileObj.geojson.replace('.geojson', '')" :value="fileObj.key">
                    </ElOption>
                </ElSelect>
                <ElSelect v-model="selectedBlockGeoJSON" @change="locateGeoJSON('block')"
                    class="geojson-selector block-selector" placeholder="请选择地块数据" filterable>
                    <ElOption v-for="fileObj in filteredBlockGeojsonFiles" :key="fileObj.key"
                        :label="fileObj.geojson.replace('.geojson', '')" :value="fileObj.key">
                    </ElOption>
                </ElSelect>
                <ElSelect v-model="selectedColorCriteria" @change="updateBlockColors" class="color-criteria-selector"
                    placeholder="请选择着色标准" filterable>
                    <ElOption label="容积率" value="floorAreaRatio"></ElOption>
                    <ElOption label="建筑密度" value="buildingDensity"></ElOption>
                    <ElOption label="建筑高度" value="avgHeight"></ElOption>
                </ElSelect>
                <ElSwitch v-model="showBlocks" @change="toggleBlockVisibility" class="block-visibility-toggle"
                    active-text="显示地块" inactive-text="隐藏地块" :value="false">
                </ElSwitch>
            </div>
        </div>
    </div>
</template>

<script setup>
import { Map, MapStyle, config } from '@maptiler/sdk';
import { shallowRef, onMounted, onUnmounted, ref, watch } from 'vue';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import maplibregl from 'maplibre-gl';
import { ElSelect, ElOption, ElSwitch } from 'element-plus';
import 'element-plus/dist/index.css';

config.apiKey = 'nMI0OagfwxzpRVopD5sR';
config.unit = 'metric'; // 比例尺公制单位

const mapContainer = shallowRef(null);
const map = shallowRef(null);
const isochroneGeojsonFiles = ref([]); // 存储等时圈数据对象数组
const blockGeojsonFiles = ref([]); // 存储地块数据对象数组
const filteredBlockGeojsonFiles = ref([]); // 存储过滤后的地块数据对象数组
const selectedIsochroneGeoJSON = ref(''); // 选择的等时圈GeoJSON文件
const selectedBlockGeoJSON = ref(''); // 选择的地块GeoJSON文件
const selectedColorCriteria = ref(''); // 选择的着色标准
const showBlocks = ref(false); // 控制地块显示开关
const draggableSelect = ref(null); // 拖动选择框
const backendUrl = import.meta.env.VITE_BACKEND_URL; // 调用全局分配的域名地址
const layerCsvContentMap = new window.Map(); // 全局csv描述信息存储Map
const displayedIsochroneLayers = ref([]); // 存储当前显示的等时圈图层
const displayedBlockLayers = ref([]); // 存储当前显示的地块图层
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

    // 监听 styleimagemissing 事件
    map.value.on('styleimagemissing', (e) => {
        const id = e.id;
        if (id === 'custom-pin') {
            map.value.loadImage(`${backendUrl}/static/images/underground2.png`, (error, image) => {
                if (error) {
                    console.error('Error loading image:', error);
                    return;
                }
                if (!map.value.hasImage('custom-pin')) {
                    map.value.addImage('custom-pin', image);
                }
            });
        }
    });

    try {
        const response = await fetch(`${backendUrl}/api/geojson-files/Nanjing`);
        if (!response.ok) {
            throw new Error('Failed to fetch geojson and csv files');
        }
        const directories = await response.json();
        console.log("Directories:", directories);

        isochroneGeojsonFiles.value = directories
            .flatMap(dir =>
                dir.files.filter(file => /地铁站_\d+\.geojson$/.test(file)).map(geojsonFile => ({
                    key: `${dir.directory}/${geojsonFile}`, // 确保唯一性
                    geojson: geojsonFile,
                    csv: dir.files.find(csvFile => csvFile === geojsonFile.replace('.geojson', '站点信息.csv')),
                    directory: dir.directory // 存储目录名称
                }))
            );

        blockGeojsonFiles.value = directories
            .flatMap(dir =>
                dir.files.filter(file => !/地铁站_\d+\.geojson$/.test(file) && file.endsWith('.geojson')).map(geojsonFile => ({
                    key: `${dir.directory}/${geojsonFile}`, // 确保唯一性
                    geojson: geojsonFile,
                    csv: dir.files.find(csvFile => csvFile === geojsonFile.replace('.geojson', '站点信息.csv')),
                    directory: dir.directory // 存储目录名称
                }))
            );

        console.log("Isochrone files:", isochroneGeojsonFiles.value);
        console.log("Block files:", blockGeojsonFiles.value);
    } catch (error) {
        console.error('Error fetching geojson and csv files:', error);
    }

    initDraggableSelect(); //拖动选择框
});

watch([isochroneGeojsonFiles, blockGeojsonFiles], () => {
    console.log("Isochrone GeoJSON files:", isochroneGeojsonFiles.value);
    console.log("Block GeoJSON files:", blockGeojsonFiles.value);
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

const loadIsochroneAndBlocks = async () => {
    // 关闭地块显示开关并隐藏当前显示的地块图层
    if (showBlocks.value) {
        showBlocks.value = false;
        await toggleBlockVisibility();
    }

    const selectedIsochrone = selectedIsochroneGeoJSON.value;
    const fileObj = isochroneGeojsonFiles.value.find(item => item.key === selectedIsochrone);
    if (!fileObj) {
        console.error(`File ${selectedIsochrone} not found in isochroneGeojsonFiles array.`);
        return;
    }

    const suffix = fileObj.geojson.match(/_(\d+)\.geojson$/)[1]; // 提取后缀（分钟数）
    const prefix = fileObj.geojson.replace(/_\d+\.geojson$/, ''); // 提取前缀

    // 获取需要隐藏的同名但后缀不同的等时圈图层
    const layersToHide = displayedIsochroneLayers.value.filter(layerId => {
        const layerFileObj = isochroneGeojsonFiles.value.find(item => item.key === layerId);
        if (!layerFileObj) return false;
        const layerSuffix = layerFileObj.geojson.match(/_(\d+)\.geojson$/)[1];
        const layerPrefix = layerFileObj.geojson.replace(/_\d+\.geojson$/, '');
        return layerPrefix === prefix && layerSuffix !== suffix;
    });

    // 隐藏需要隐藏的等时圈图层
    layersToHide.forEach(layerId => {
        if (map.value.getLayer(`${layerId}-geojson-layer-fill`)) {
            map.value.setLayoutProperty(`${layerId}-geojson-layer-fill`, 'visibility', 'none');
        }
        if (map.value.getLayer(`${layerId}-geojson-layer-line`)) {
            map.value.setLayoutProperty(`${layerId}-geojson-layer-line`, 'visibility', 'none');
        }
        displayedIsochroneLayers.value = displayedIsochroneLayers.value.filter(id => id !== layerId);
    });

    // 显示当前选择的等时圈图层
    const existingLayer = displayedIsochroneLayers.value.find(layerId => layerId === fileObj.key);
    if (existingLayer) {
        if (map.value.getLayer(`${fileObj.key}-geojson-layer-fill`)) {
            map.value.setLayoutProperty(`${fileObj.key}-geojson-layer-fill`, 'visibility', 'visible');
        }
        if (map.value.getLayer(`${fileObj.key}-geojson-layer-line`)) {
            map.value.setLayoutProperty(`${fileObj.key}-geojson-layer-line`, 'visibility', 'visible');
        }
        console.log(`Shown GeoJSON layers for source ${fileObj.key}`);
        return;
    }

    const geojsonUrl = `${backendUrl}/api/geojson-files/Nanjing/${encodeURIComponent(fileObj.directory)}/${encodeURIComponent(fileObj.geojson)}`;
    console.log(`Fetching GeoJSON data from ${geojsonUrl}`);
    const response = await fetch(geojsonUrl);
    if (!response.ok) {
        console.error(`Failed to fetch ${geojsonUrl}: ${response.statusText}`);
        return;
    }
    const geojsonData = await response.json();

    // 不自动显示相交的地块数据
    filteredBlockGeojsonFiles.value = blockGeojsonFiles.value.filter(blockFile => false);

    console.log("Filtered block geojson files:", filteredBlockGeojsonFiles.value);

    // 显示新的等时圈
    await addGeoJSONLayers(geojsonData, fileObj.key);
    displayedIsochroneLayers.value.push(fileObj.key); // 添加到显示的图层列表中

    // 跳转到等时圈位置
    const center = calculateCenter(geojsonData.features || []);
    if (center) {
        map.value.flyTo({
            center: center,
            zoom: 13,
            essential: true
        });
    } else {
        console.error(`无法定位到 ${selectedIsochrone}，因为中心坐标无效`);
    }
};


const locateGeoJSON = async (type) => {
    const selectedFilename = type === 'isochrone' ? selectedIsochroneGeoJSON.value : selectedBlockGeoJSON.value;
    try {
        const fileObj = type === 'isochrone'
            ? isochroneGeojsonFiles.value.find(item => item.key === selectedFilename)
            : filteredBlockGeojsonFiles.value.find(item => item.key === selectedFilename);
        if (!fileObj) {
            throw new Error(`File ${selectedFilename} not found in geojsonFiles array.`);
        }

        const geojsonUrl = `${backendUrl}/api/geojson-files/Nanjing/${encodeURIComponent(fileObj.directory)}/${encodeURIComponent(fileObj.geojson)}`;
        console.log(`Fetching GeoJSON data from ${geojsonUrl}`);
        const response = await fetch(geojsonUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${geojsonUrl}: ${response.statusText}`);
        }
        const geojsonData = await response.json();

        await addGeoJSONLayers(geojsonData, fileObj.key);

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

const toggleBlockVisibility = async () => {
    if (!selectedIsochroneGeoJSON.value) return;

    const fileObj = isochroneGeojsonFiles.value.find(item => item.key === selectedIsochroneGeoJSON.value);
    if (!fileObj) return;

    const geojsonUrl = `${backendUrl}/api/geojson-files/Nanjing/${encodeURIComponent(fileObj.directory)}/${encodeURIComponent(fileObj.geojson)}`;
    console.log(`Fetching GeoJSON data from ${geojsonUrl}`);
    const response = await fetch(geojsonUrl);
    if (!response.ok) {
        console.error(`Failed to fetch ${geojsonUrl}: ${response.statusText}`);
        return;
    }
    const geojsonData = await response.json();
    const intersectingBlocks = geojsonData.features[0].properties.intersecting_blocks;

    filteredBlockGeojsonFiles.value = blockGeojsonFiles.value.filter(blockFile =>
        intersectingBlocks.includes(blockFile.geojson.replace('.geojson', ''))
    );

    const visibility = showBlocks.value ? 'visible' : 'none';
    filteredBlockGeojsonFiles.value.forEach(async (blockFileObj) => {
        if (map.value.getLayer(`${blockFileObj.key}-geojson-layer-fill`)) {
            map.value.setLayoutProperty(`${blockFileObj.key}-geojson-layer-fill`, 'visibility', visibility);
        } else {
            // 如果图层不存在，则添加它
            const blockGeojsonUrl = `${backendUrl}/api/geojson-files/Nanjing/${encodeURIComponent(blockFileObj.directory)}/${encodeURIComponent(blockFileObj.geojson)}`;
            console.log(`Fetching Block GeoJSON data from ${blockGeojsonUrl}`);
            const blockResponse = await fetch(blockGeojsonUrl);
            if (!blockResponse.ok) {
                console.error(`Failed to fetch ${blockGeojsonUrl}: ${blockResponse.statusText}`);
                return;
            }
            const blockGeojsonData = await blockResponse.json();
            await addGeoJSONLayers(blockGeojsonData, blockFileObj.key);
        }
        if (map.value.getLayer(`${blockFileObj.key}-geojson-layer-line`)) {
            map.value.setLayoutProperty(`${blockFileObj.key}-geojson-layer-line`, 'visibility', visibility);
        }
    });
};

async function addGeoJSONLayers(geojsonData, sourceId) {
    if (!map.value) return;
    let currentPopup;

    console.log(`Adding GeoJSON layers for source ${sourceId}`);
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

        if (colorCriteria && config.id.includes('fill')) {
            const fillColor = getColorInterpolation(colorCriteria);
            if (fillColor) {
                layerConfig.paint['fill-color'] = fillColor;
            }
        } else if (colorCriteria && config.id.includes('line')) {
            const lineColor = getColorInterpolation(colorCriteria);
            if (lineColor) {
                layerConfig.paint['line-color'] = lineColor;
            }
        } else {
            // 设置默认颜色
            if (config.id.includes('fill')) {
                layerConfig.paint['fill-color'] = '#90EE90'; // 浅绿色
            } else if (config.id.includes('line')) {
                layerConfig.paint['line-color'] = '#006400'; // 深绿色
            }
        }

        if (!map.value.getLayer(layerConfig.id)) {
            map.value.addLayer(layerConfig);
        } else {
            // 在设置属性前检查图层是否存在
            if (layerConfig.paint && layerConfig.paint['fill-color']) {
                map.value.setPaintProperty(layerConfig.id, 'fill-color', layerConfig.paint['fill-color']);
            } else if (layerConfig.paint && layerConfig.paint['line-color']) {
                map.value.setPaintProperty(layerConfig.id, 'line-color', layerConfig.paint['line-color']);
            }
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

    // 确保图标加载
    if (!map.value.hasImage('custom-pin')) {
        map.value.loadImage(`${backendUrl}/static/images/underground2.png`, (error, image) => {
            if (error) {
                console.error('Error loading image:', error);
                return;
            }
            if (!map.value.hasImage('custom-pin')) {
                map.value.addImage('custom-pin', image);
            }
        });
    }
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

function getColorInterpolation(criteria) {
    switch (criteria) {
        case 'floorAreaRatio':
            return [
                'interpolate',
                ['linear'],
                ['get', 'floorAreaRatio'],
                0, 'rgb(250,209,209)',
                1, 'rgb(246,162,163)',
                5, 'rgb(241,116,116)',
                10, 'rgb(238,69,68)',
                15, 'rgb(233,32,24)',
                1000, 'rgb(255,255,255)' // 用于定义最大值以上的颜色
            ];
        case 'buildingDensity':
            return [
                'interpolate',
                ['linear'],
                ['get', 'buildingDensity'],
                0, 'rgb(245,230,208)',
                0.2, 'rgb(235,205,160)',
                0.4, 'rgb(225,179,111)',
                0.6, 'rgb(215,152,62)',
                0.8, 'rgb(205,127,16)',
                1, 'rgb(205,127,16)',
                10, 'rgb(255,255,255)' // 用于定义最大值以上的颜色
            ];
        case 'avgHeight':
            return [
                'interpolate',
                ['linear'],
                ['get', 'avgHeight'],
                0, 'rgb(253,252,230)',
                10, 'rgb(250,249,205)',
                30, 'rgb(247,244,168)',
                50, 'rgb(243,240,129)',
                100, 'rgb(241,235,90)',
                150, 'rgb(238,230,50)',
                200, 'rgb(235,224,10)',
                1000, 'rgb(255,255,255)' // 用于定义最大值以上的颜色
            ];
        default:
            return null;
    }
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

const updateBlockColors = async () => {
    const colorCriteria = selectedColorCriteria.value;
    if (!colorCriteria) return;

    filteredBlockGeojsonFiles.value.forEach(async (blockFileObj) => {
        if (map.value.getLayer(`${blockFileObj.key}-geojson-layer-fill`)) {
            map.value.setPaintProperty(`${blockFileObj.key}-geojson-layer-fill`, 'fill-color', [
                'interpolate',
                ['linear'],
                ['get', colorCriteria],
                ...(colorCriteria === 'floorAreaRatio' ? getFloorAreaRatioColors() :
                    colorCriteria === 'buildingDensity' ? getBuildingDensityColors() : getBuildingHeightColors())
            ]);
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

.block-visibility-toggle {
    top: 100px;
    left: 10px;
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

.selector-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
</style>
