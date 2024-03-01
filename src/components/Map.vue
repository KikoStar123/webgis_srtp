<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div class="draggable-select" ref="draggableSelect">
            <ElSelect v-model="selectedGeoJSON" @change="locateGeoJSON" class="geojson-selector" placeholder="请选择GeoJSON文件">
                <ElOption
                    v-for="fileObj in geojsonFiles"
                    :key="fileObj.geojson"
                    :label="fileObj.geojson"
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


config.apiKey = '8aGJnKohQXrQH0N10jZP';

const mapContainer = shallowRef(null);
const map = shallowRef(null);
const geojsonFiles = ref([]);//存储对象数组
const selectedGeoJSON = ref(''); //下拉列表
const draggableSelect = ref(null);//拖动选择框
const backendUrl = import.meta.env.VITE_BACKEND_URL;//调用全局分配的域名地址
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
                    addGeoJSONToMap(geojsonData, fileObj.geojson);
                } catch (error) {
                    console.error(`Error loading GeoJSON from ${fileObj.geojson}:`, error);
                }
            });
        });
    } catch (error) {
        console.error('Error fetching geojson and csv files:', error);
    }


    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseDown = (e) => {//以下三个函数是拖动选择框的逻辑
        isDragging = true;
        // 获取选择框当前的left和top值，如果还未设置，则默认为0
        const computedStyle = window.getComputedStyle(draggableSelect.value);
        const currentLeft = parseInt(computedStyle.left, 10) || 0;
        const currentTop = parseInt(computedStyle.top, 10) || 0;
        // 计算点击位置与选择框当前位置之间的偏移量
        offsetX = e.clientX - currentLeft;
        offsetY = e.clientY - currentTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        // 根据鼠标当前位置减去偏移量来计算选择框的新位置
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

});


onUnmounted(() => {//析构函数
    map.value?.remove();
});


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


const locateGeoJSON = async () => {//定位区域函数
    const selectedFilename = selectedGeoJSON.value; // 使用v-model绑定的值
    try {
        const response = await fetch(`./geojson/${selectedFilename}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${selectedFilename}: ${response.statusText}`);
        }
        const geojsonData = await response.json();
        
        // 确保 geojsonData 是 GeoJSON 对象并且有 features 属性
        if (!geojsonData || !Array.isArray(geojsonData.features)) {
            throw new Error(`Invalid GeoJSON data for ${selectedFilename}`);
        }

        const center = calculateCenter(geojsonData.features);
        if (center) {
            map.value.flyTo({
                center: center,
                zoom: 15.5, // 根据需要调整缩放级别
                essential: true // 对支持减少运动的用户跳过动画
            });
        } else {
            console.error(`无法定位到 ${selectedFilename}，因为中心坐标无效`);
        }
    } catch (error) {
        console.error(`Error locating ${selectedFilename}:`, error);
    }
};


const addGeoJSONToMap = (geojsonData, sourceId) => {
    if (!map.value) return;

    map.value.addSource(sourceId, {
        type: 'geojson',
        data: geojsonData
    });

    layerConfigs.forEach(config => {
        const layerConfig = { ...config, source: sourceId, id: `${sourceId}-${config.id}` };
        map.value.addLayer(layerConfig);

        if (config.type === 'fill') {
            map.value.on('mouseenter', layerConfig.id, () => {
                map.value.setPaintProperty(layerConfig.id, 'fill-color', '#B22222');
                map.value.getCanvas().style.cursor = 'pointer';
            });
            map.value.on('mouseleave', layerConfig.id, () => {
                map.value.setPaintProperty(layerConfig.id, 'fill-color', config.paint['fill-color']);
                map.value.getCanvas().style.cursor = '';
            });
            map.value.on('click', layerConfig.id, async (e) => {
                // 寻找与当前GeoJSON相关联的CSV文件路径
                const fileObj = geojsonFiles.value.find(item => item.geojson === sourceId);
                if (fileObj && fileObj.csv) {
                    // 确保构建正确的CSV文件访问URL
                    const csvUrl = `${backendUrl}/static/city/Nanjing/${fileObj.directory}/${fileObj.csv}`;
                    try {
                        const response = await fetch(csvUrl);
                        if (!response.ok) throw new Error('Failed to fetch CSV data');
                        const csvText = await response.text();

                        // 显示CSV文本，实际应用中可能需要解析并以友好的格式展示
                        new maplibregl.Popup()
                            .setLngLat(e.lngLat)
                            .setHTML(`<pre>${csvText}</pre>`)
                            .addTo(map.value);
                    } catch (error) {
                        console.error('Error loading or displaying CSV data:', error);
                    }
                } else {
                    // 若没有找到CSV文件，仅显示GeoJSON文件名
                    const filenameWE = sourceId.split('.').slice(0, -1).join('.');
                    new maplibregl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(`<p>${filenameWE}</p>`)
                        .addTo(map.value);
                }
            });
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
