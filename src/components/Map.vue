<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div class="draggable-select" ref="draggableSelect">
            <ElSelect v-model="selectedGeoJSON" @change="locateGeoJSON" class="geojson-selector" placeholder="请选择地铁站">
                <ElOption
                    v-for="fileObj in geojsonFiles"
                    :key="fileObj.geojson"
                    :label="fileObj.geojson.replace('.geojson', '')"
                    :value="fileObj.geojson">
                </ElOption>
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

const mapContainer = shallowRef(null);
const map = shallowRef(null);
const geojsonFiles = ref([]);//存储对象数组
const selectedGeoJSON = ref(''); //下拉列表
const draggableSelect = ref(null);//拖动选择框
const backendUrl = import.meta.env.VITE_BACKEND_URL;//调用全局分配的域名地址
const layerCsvContentMap = new window.Map();//全局csv描述信息存储Map
const layerConfigs = [// 图层配置
    {
        id: 'geojson-layer-fill',
        type: 'fill',
        source: 'geojson',
        paint: {
            'fill-color': '#FF0000', // 默认填充颜色为红色
            'fill-opacity': 0.4
        }
    },
    {
        id: 'geojson-layer-line',
        type: 'line',
        source: 'geojson',
        paint: {
            'line-color': '#B30000', // 默认边框颜色为黑色
            'line-width': 2
        }
    }
];


onMounted(async() => {//构造函数
    const initialState = { lng: 116.2, lat: 39.5, zoom: 7 };
    map.value = new Map({
        container: mapContainer.value,
        style: MapStyle.STREETS,
        center: [initialState.lng, initialState.lat],
        zoom: initialState.zoom
    });

    /*调用server.js后端api读取geojson文件,
    运行之前在项目根目录使用终端运行：'node server/server.js' 以启动后端服务 */
    try {
        const response = await fetch(`${backendUrl}/api/geojson-files/Nanjing`);
        if (!response.ok) {
            throw new Error('Failed to fetch geojson and csv files');
        }
        const directories = await response.json();

        // 处理返回的数据，为每个.geojson文件和对应的.csv文件创建一个对象
        geojsonFiles.value = directories.flatMap(dir =>
            dir.files.filter(file => file.endsWith('.geojson')).map(geojsonFile => ({
                geojson: geojsonFile,
                csv: dir.files.find(csvFile => csvFile === geojsonFile.replace('.geojson', '站点信息.csv')),
                directory: dir.directory // 存储目录名称
            }))
        );

        // 地图加载完成后，为每个geojson文件添加图层
        map.value.on('load', () => {
            geojsonFiles.value.forEach(async (fileObj) => {
                const geojsonUrl = `${backendUrl}/static/city/Nanjing/${fileObj.directory}/${fileObj.geojson}`;
                try {
                    const geojsonResponse = await fetch(geojsonUrl);
                    if (!geojsonResponse.ok) {
                        throw new Error(`Failed to fetch GeoJSON data from ${geojsonUrl}`);
                    }
                    const geojsonData = await geojsonResponse.json();
                    // 使用geojsonData添加地图图层
                    addGeoJSONLayers(geojsonData, fileObj.geojson);
                } catch (error) {
                    console.error(`Error loading GeoJSON from ${fileObj.geojson}:`, error);
                }
            });
        });
    } catch (error) {
        console.error('Error fetching geojson and csv files:', error);
    }

    initDraggableSelect();//拖动选择框

});


onUnmounted(() => {//析构函数
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


const calculateCenter = (features) => {//计算区域中心函数
    let x = 0, y = 0, count = 0;
    features.forEach(feature => {
        let coordinates = [];
        if (feature.geometry.type === 'Polygon') {
            coordinates = feature.geometry.coordinates[0]; // 取第一个多边形环
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


const locateGeoJSON = async () => {
    const selectedFilename = selectedGeoJSON.value; // 使用v-model绑定的值
    try {
        const fileObj = geojsonFiles.value.find(item => item.geojson === selectedFilename);
        if (!fileObj) {
            throw new Error(`File ${selectedFilename} not found in geojsonFiles array.`);
        }

        const geojsonUrl = `${backendUrl}/static/city/Nanjing/${fileObj.directory}/${fileObj.geojson}`;
        const response = await fetch(geojsonUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${geojsonUrl}: ${response.statusText}`);
        }
        const geojsonData = await response.json();

        // 如果GeoJSON是Polygon类型，将其包装在FeatureCollection中
        let features = [];
        if (geojsonData.type === 'Polygon') {
            features.push({
                type: 'Feature',
                properties: {},
                geometry: geojsonData
            });
        } else if (geojsonData.type === 'FeatureCollection') {
            features = geojsonData.features;
        } else {
            throw new Error(`Unsupported GeoJSON type: ${geojsonData.type}`);
        }

        const center = calculateCenter(features);
        if (center) {
            map.value.flyTo({
                center: center,
                zoom: 14.5,
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

    // 添加 GeoJSON 数据源
    map.value.addSource(sourceId, {
        type: 'geojson',
        data: geojsonData
    });

    
    layerConfigs.forEach(config => {// 根据配置添加非点图层
        const layerConfig = {
            ...config,
            source: sourceId,
            id: `${sourceId}-${config.id}`,
            layout: { visibility: 'none' } // 初始设置为不可见
        };
        map.value.addLayer(layerConfig);

        // 如果是非点图层，则添加点击事件处理逻辑
        if (config.type !== 'symbol') {
            map.value.on('contextmenu', layerConfig.id, (e) => {
                e.preventDefault(); // 阻止默认的右键菜单事件
                const properties = e.features[0].properties; 
                const coordinates = e.lngLat;
                const layerId = `${sourceId}-${config.id}`;
                const csvHtmlContent = layerCsvContentMap.get(layerId);
                new maplibregl.Popup()
                    .setLngLat([coordinates.lng, coordinates.lat])
                    .setHTML(csvHtmlContent)
                    .addTo(map.value);
            });

        }
    });

    // 加载与当前 GeoJSON 关联的 CSV 文件并添加点图层
    const fileObj = geojsonFiles.value.find(item => item.geojson === sourceId);
    if (fileObj && fileObj.csv) {
        const csvUrl = `${backendUrl}/static/city/Nanjing/${fileObj.directory}/${fileObj.csv}`;
        try {
            const csvResponse = await fetch(csvUrl);
            if (!csvResponse.ok) throw new Error(`Failed to fetch ${csvUrl}: ${csvResponse.statusText}`);
            const csvText = await csvResponse.text();
            const pointsData = parseCSVToGeoJSON(csvText); // 解析 CSV 为 GeoJSON
            const csvHtmlContent = formatCSVAsHTML(csvText);
            layerConfigs.forEach(config => {
                const layerId = `${sourceId}-${config.id}`;
                layerCsvContentMap.set(layerId, csvHtmlContent);
            });

            // 加载自定义图标并添加点图层
            map.value.loadImage(`${backendUrl}/static/images/underground2.png`, async (error, image) => {
                if (error) return console.error('Error loading image:', error);
                if (!map.value.hasImage('custom-pin')) map.value.addImage('custom-pin', image);

                map.value.addSource(`${sourceId}-points`, { type: 'geojson', data: pointsData });
                map.value.addLayer({
                    id: `${sourceId}-points-layer`,
                    type: 'symbol',
                    source: `${sourceId}-points`,
                    layout: {
                        'icon-image': 'custom-pin',
                        'icon-size': 0.12,
                        'icon-anchor': 'bottom'
                    },
                    minzoom: 10,
                });

                // 点击点图层控制非点图层的可见性
                map.value.on('click', `${sourceId}-points-layer`, (e) => {
                    const features = map.value.queryRenderedFeatures(e.point, { layers: [`${sourceId}-points-layer`] });
                    if (features.length > 0) {
                        layerConfigs.forEach(config => {
                            const targetLayerId = `${sourceId}-${config.id}`;
                            toggleLayerVisibility(targetLayerId);
                        });
                    }
                });
            });

        } catch (error) {
            console.error(`Error loading or parsing CSV from ${fileObj.csv}:`, error);
        }
    }
}


//从csv文件当中获取经纬度
function parseCSVToGeoJSON(csvText) {
    // 移除 CSV 头部（列标题行），并分割每一行
    const lines = csvText.trim().split('\n').slice(1);

    const features = lines.map(line => {
        // CSV 分割，考虑到经纬度在引号内
        const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

        // 提取经纬度，假设格式为 "(纬度, 经度)"
        const regex = /\(([^,]+),\s*([^)]+)\)/;
        const match = columns[1].match(regex);
        if (!match) return null;

        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (isNaN(lat) || isNaN(lng)) return null;

        // 构建并返回 GeoJSON Feature
        return {
            type: 'Feature',
            properties: {
                name: columns[0].replace(/"/g, ''), // 站点名称
                exits: parseInt(columns[2], 10), // 出入口个数
                // 根据需要添加更多属性
            },
            geometry: {
                type: 'Point',
                coordinates: [lng, lat] // GeoJSON 需要 [经度, 纬度] 格式
            }
        };
    }).filter(feature => feature != null);

    return {
        type: "FeatureCollection",
        features
    };
}

function formatCSVAsHTML(csvText) {
    // 将CSV文本按行分割，并将每行分割成列
    const rows = csvText.trim().split('\n').map(row => row.split(','));

    // 转置行和列
    // 如果 rows 是空的，转置结果也是空数组
    const columns = rows[0] ? rows[0].map((col, i) => rows.map(row => row[i])) : [];

    // 将每一列（现在是“行”）转换为HTML
    const htmlLines = columns.map(column => {
        // 将每个元素用逗号和空格连接，然后用<p>标签包裹
        return `<p>${column.join(':')}</p>`;
    }).join('');

    return htmlLines;
}



//PointLayer点击实现逻辑
function addClickEventForPointsLayer(layerId, sourceId) {
    map.value.on('click', layerId, (e) => {
        // 切换相关 GeoJSON 图层的可见性
        layerConfigs.forEach(config => {
            const targetLayerId = `${sourceId}-${config.id}`;
            toggleLayerVisibility(targetLayerId);
        });
    });
}


function toggleLayerVisibility(layerId) {
    const visibility = map.value.getLayoutProperty(layerId, 'visibility');
    map.value.setLayoutProperty(layerId, 'visibility', visibility === 'visible' ? 'none' : 'visible');
}

function toggleLayerVisibility_(layerId) {
    // 检查图层是否存在
    if (!map.value.getLayer(layerId)) {
        console.error(`Layer "${layerId}" does not exist.`);
        return;
    }

    const visibility = map.value.getLayoutProperty(layerId, 'visibility');

    // 输出当前图层的可见性状态，以便调试
    console.log(`Current visibility of "${layerId}": ${visibility}`);

    // 如果图层当前不可见，则将其设置为可见，反之亦然
    if (visibility === 'visible') {
        map.value.setLayoutProperty(layerId, 'visibility', 'none');
    } else {
        map.value.setLayoutProperty(layerId, 'visibility', 'visible');
    }
}



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
    top: 10px;
    left: 10px; 
    z-index: 1000;
    width: 240px;
    border-radius: 8px; /* 圆角 */
    box-shadow: 0 4px 6px rgba(0,0,0,0.1); /* 阴影 */
    background-color: #ffffff; /* 背景色 */
    color: #333; /* 文字颜色 */
}

.el-select .el-input {
    border-radius: 8px; /* 下拉框圆角 */
}

.el-select-dropdown {
    border-radius: 8px; /* 下拉选项圆角 */
    box-shadow: 0 4px 6px rgba(0,0,0,0.1); /* 下拉选项阴影 */
}

.draggable-select {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    cursor: grab;
}

</style>
