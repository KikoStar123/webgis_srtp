<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div class="draggable-select" ref="draggableSelect">
            <ElSelect 
                v-model="selectedGeoJSON" 
                @change="locateGeoJSON" 
                class="geojson-selector" 
                placeholder="请选择地铁站"
                filterable>
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
config.unit = 'metric'; // 比例尺公制单位

const mapContainer = shallowRef(null);
const map = shallowRef(null);
const geojsonFiles = ref([]);//存储对象数组
const selectedGeoJSON = ref(''); //下拉列表
const draggableSelect = ref(null);//拖动选择框
const backendUrl = import.meta.env.VITE_BACKEND_URL;//调用全局分配的域名地址
const layerCsvContentMap = new window.Map();//全局csv描述信息存储Map
const lockedLayerId = ref(null); // 默认没有图层被锁定，用于存储图层锁定状态
const layerConfigs = [//图层配置
    {
        id: 'geojson-layer-fill',
        type: 'fill',
        source: 'geojson',
        paint: {
            'fill-color': '#90EE90', // 浅绿色
            'fill-opacity': 0.4    // 透明度
        }
    },
    {
        id: 'geojson-layer-line',
        type: 'line',
        source: 'geojson',
        paint: {
            'line-color': '#006400', // 深绿色
            'line-width': 2,
            'line-opacity': 0.5     // 透明度
        }
    }
];

onMounted(async() => {//构造函数
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

//选择框的拖动逻辑
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
                zoom: 13,
                essential: true
            });

            // 遍历所有图层，调整可见性，但尊重锁定状态
            layerConfigs.forEach(config => {
                const layerId = `${fileObj.geojson}-${config.id}`;
                const isLocked = lockedLayerId.value === layerId;

                // 如果该图层被锁定，则显示它；否则，如果不是被选中的新图层，则隐藏它
                if (isLocked || selectedFilename === fileObj.geojson) {
                    toggleLayerVisibility(layerId);
                } else {
                    toggleLayerVisibility(layerId); // 这里可以根据需要修改成隐藏图层的逻辑
                }
            });

            // 如果选中的新图层没有被锁定，则更新锁定状态为 null
            if (lockedLayerId.value !== null && selectedFilename !== lockedLayerId.value.split('-')[0]) {
                lockedLayerId.value = null;
            }
        } else {
            console.error(`无法定位到 ${selectedFilename}，因为中心坐标无效`);
        }
    } catch (error) {
        console.error(`Error locating ${selectedFilename}:`, error);
    }
};


async function addGeoJSONLayers(geojsonData, sourceId) {
    if (!map.value) return;
    let currentPopup; // 在函数作用域内维护当前弹窗的引用
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
                // 如果当前已经有一个弹窗，则关闭它
                if (currentPopup) {
                    currentPopup.remove();
                }
                const properties = e.features[0].properties; 
                const coordinates = e.lngLat;
                const layerId = `${sourceId}-${config.id}`;
                const csvHtmlContent = layerCsvContentMap.get(layerId);
                currentPopup =new maplibregl.Popup()
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
                    minzoom: 7,
                });

                // 点击点图层控制非点图层的可见性
                map.value.on('click', `${sourceId}-points-layer`, (e) => {
                    const features = map.value.queryRenderedFeatures(e.point, { layers: [`${sourceId}-points-layer`] });
                    if (features.length > 0) {
                        layerConfigs.forEach(config => {
                            //shakeIconAnimation(`${sourceId}-points-layer`, 0.12, 0.24, 0.03, 500);
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
    // 按行分割CSV文本
    const rows = csvText.trim().split('\n').map(row => {
        // 处理每一行，考虑到被双引号包裹的字段
        let match;
        const cells = [];
        const regex = /(".*?"|[^",]+)(,|$)/g; // 匹配被双引号包裹或不包含逗号的字段
        while ((match = regex.exec(row)) !== null) {
            // 删除字段两端的双引号（如果有）
            let cell = match[1].replace(/^"|"$/g, '');
            cells.push(cell);
        }
        return cells;
    });

    // 转置行和列
    const columns = rows[0] ? rows[0].map((_, i) => rows.map(row => row[i])) : [];

    // 将每一列（现在是“行”）转换为HTML
    const htmlLines = columns.map(column => {
        // 将每个元素用冒号和空格连接，然后用<p>标签包裹
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

//控制显示或者隐藏函数
function toggleLayerVisibility(layerId, isLocking = false) {
    if (!map.value) return;

    // 如果尝试操作的是被锁定的图层，并且这次操作不是来自锁定/解锁操作，则直接返回
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

//实现透明度变化动画的函数
function changeLayerOpacity(layerId, startOpacity, endOpacity, layerType, duration = 500) {
    const opacityProperty = layerType === 'fill' ? 'fill-opacity' : 'line-opacity';
    
    // 确保动画开始前图层可见
    if (startOpacity < endOpacity) {
        map.value.setLayoutProperty(layerId, 'visibility', 'visible');
    }

    const step = (endOpacity - startOpacity) / (duration / 10);
    let currentOpacity = startOpacity;

    function stepFunction() {
        if ((step > 0 && currentOpacity < endOpacity) || (step < 0 && currentOpacity > endOpacity)) {
            currentOpacity += step;
            // 使用 Math.max 确保透明度不小于 0
            const safeOpacity = Math.max(0, currentOpacity);
            map.value.setPaintProperty(layerId, opacityProperty, safeOpacity);
            requestAnimationFrame(stepFunction);
        } else {
            // 动画结束，确保透明度不小于 0
            const finalOpacity = Math.max(0, endOpacity);
            map.value.setPaintProperty(layerId, opacityProperty, finalOpacity);
            if (endOpacity === 0) {
                map.value.setLayoutProperty(layerId, 'visibility', 'none');
            }
        }
    }

    stepFunction();
}

//实现图标抖动动画的函数
// function shakeIconAnimation(layerId, startSize, endSize, step, duration) {
//     if (!map.value) {
//         console.error("Map instance is not initialized.");
//         return;
//     }

//     let currentSize = startSize;
//     let growing = true;
//     const startTime = performance.now();

//     function animate(time) {
//         if (!map.value) {
//             // 如果此时地图实例不存在了，就停止动画
//             console.error("Map instance is not available.");
//             return;
//         }

//         const elapsedTime = time - startTime;
//         if (growing) {
//             currentSize += step;
//             if (currentSize >= endSize) {
//                 growing = false;
//                 currentSize -= step; // 开始缩小
//             }
//         } else {
//             currentSize -= step;
//             if (currentSize <= startSize) {
//                 // 确保不会小于初始大小并结束动画
//                 currentSize = startSize;
//                 growing = true; // 重置状态以便下一次动画
//                 map.value.setPaintProperty(layerId, 'icon-size', currentSize);
//                 return; // 停止动画
//             }
//         }

//         map.value.setPaintProperty(layerId, 'icon-size', currentSize);
        
//         if (elapsedTime < duration) {
//             requestAnimationFrame(animate);
//         } else {
//             // 动画结束，确保图标大小恢复初始值
//             map.value.setPaintProperty(layerId, 'icon-size', startSize);
//         }
//     }

//     requestAnimationFrame(animate);
// }

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
