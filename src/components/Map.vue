<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div :class="['control-panel', { collapsed: isPanelCollapsed }]">
            <!-- 展开/折叠按钮 -->
            <div class="toggle-panel-btn">
                <el-button type="primary" @click="togglePanelVisibility">
                    {{ isPanelCollapsed ? '展开菜单' : '折叠菜单' }}
                </el-button>
            </div>

            <!-- 菜单内容 -->
            <div class="selector-container" v-show="!isPanelCollapsed">
                <!-- 城市选择框 -->
                <ElSelect v-model="selectedCity" class="city-selector" placeholder="请选择城市" filterable
                    @change="onCityChange">
                    <ElOption v-for="city in cities" :key="city" :label="city" :value="city"></ElOption>
                </ElSelect>

                <!-- 时间选择按钮组 -->
                <ElRadioGroup v-model="selectedTime" class="time-selector">
                    <ElRadioButton label="5分钟">5分钟</ElRadioButton>
                    <ElRadioButton label="10分钟">10分钟</ElRadioButton>
                </ElRadioGroup>

                <!-- 等时圈选择列表 -->
                <ElSelect v-model="selectedIsochroneGeoJSON" class="isochrone-selector" placeholder="请选择等时圈数据"
                    filterable multiple>
                    <ElOption v-for="fileObj in isochroneGeojsonFiles" :key="fileObj.key"
                        :label="fileObj.geojson.replace('.geojson', '')" :value="fileObj.key"></ElOption>
                </ElSelect>

                <!-- 地块属性选择框 -->
                <ElSelect v-model="selectedProperty" class="geojson-selector" placeholder="请选择地块属性" filterable
                    @change="updateBlockColors">
                    <ElOption v-for="property in properties" :key="property.value" :label="property.label"
                        :value="property.value">
                    </ElOption>
                </ElSelect>


                <!-- 地块显示/隐藏开关 -->
                <ElSwitch v-model="showBlocks" @change="toggleBlockVisibility" class="block-visibility-toggle"
                    active-text="显示地块" inactive-text="隐藏地块"></ElSwitch>
            </div>
        </div>
    </div>
</template>




<script setup>
import { Map, MapStyle, config } from '@maptiler/sdk';
import { shallowRef, onMounted, onUnmounted, ref, watch } from 'vue';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import maplibregl from 'maplibre-gl';
import { ElSelect, ElOption, ElSwitch, ElRadioGroup, ElRadioButton } from 'element-plus';
import { nextTick } from 'vue';
//import * as turf from '@turf/turf'; // 导入 turf.js 库
//import jsts from 'jsts'; // 导入 JSTS 库
import * as jsts from 'jsts/dist/jsts.min.js';
import 'element-plus/dist/index.css';
import * as turf from '@turf/turf'; // Turf.js 库


config.apiKey = 'nMI0OagfwxzpRVopD5sR';
config.unit = 'metric'; // 比例尺公制单位

const mapContainer = shallowRef(null);
const map = shallowRef(null);
const isochroneGeojsonFiles = ref([]); // 存储等时圈数据对象数组
const selectedIsochroneGeoJSON = ref([]); // 选择的等时圈GeoJSON文件，支持多选
const selectedTime = ref(''); // 选择的时间（5分钟或10分钟）
const selectedProperty = ref('floorAreaRatio'); // 选择的属性，默认选择第一个属性
const showBlocks = ref(false); // 控制地块显示开关
const blockNames = ref({}); // 存储每个等时圈对应的地块名称列表
const properties = ref([
    { label: '容积率', value: 'floorAreaRatio' },
    { label: '建筑密度', value: 'buildingDensity' },
    { label: '平均高度', value: 'avgHeight' }
]); // 地块属性列表
 // 地块属性列表
const backendUrl = "http://47.101.210.178:3001"; // 调用全局分配的域名地址
let lastSelectedIsochrones = []; // 用于缓存上次计算交集的等时圈集合
const entranceMarkers = []; // 用于存储入口的标记，以便清除
const entranceMarkersMap = {}; // 用于存储每个等时圈的入口标记
const cities = ref([]); // 存储城市列表
const selectedCity = ref(''); // 当前选择的城市
let isLoading = false; // 控制加载状态，防止重复触发
const isPanelCollapsed = ref(false);




onMounted(async () => {
    // 获取城市列表
    await loadCities();

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
        scaleControl: true // 比例尺
    });

    map.value.on('load', () => {
        console.log('Map has fully loaded.');
    });
});

const loadCities = async () => {
    try {
        const response = await fetch('http://47.101.210.178:3001/query/cities');
        if (!response.ok) {
            throw new Error('Failed to fetch city data');
        }
        cities.value = await response.json();
    } catch (error) {
        console.error('Error fetching city data:', error);
    }
};

// 城市选择变化时，重新加载等时圈数据
const onCityChange = async () => {
    if (!selectedCity.value) return;

    try {
        const response = await fetch(`${backendUrl}/query/${selectedCity.value}/station`);
        if (!response.ok) {
            throw new Error('Failed to fetch station data for selected city');
        }
        const stations = await response.json();
        isochroneGeojsonFiles.value = stations.map(station => ({
            key: station,
            geojson: station
        }));

        // 加载默认站点的出入口数据
        if (stations.length > 0) {
            await loadStationEntrances(stations[0]);
        }
    } catch (error) {
        console.error('Error fetching station data:', error);
    }
};

const togglePanelVisibility = () => {
    isPanelCollapsed.value = !isPanelCollapsed.value;
};

// 监听等时圈和时间选择的变化
watch([selectedIsochroneGeoJSON, selectedTime], async ([newIsochrones, newTime], [oldIsochrones, oldTime]) => {
    // 找出取消选择的等时圈
    const removedIsochrones = oldIsochrones ? oldIsochrones.filter(isochrone => !newIsochrones.includes(isochrone)) : [];

    // 卸载取消选择的等时圈及相关地块和入口
    removedIsochrones.forEach(isochrone => {
        hideAndRemoveCurrentBlocks(isochrone);
        unloadStationEntrances(isochrone); // 卸载入口
    });

    // 如果新的选择集合与上次的缓存集合相同，则不重新计算交集
    if (arraysEqual(newIsochrones, lastSelectedIsochrones) && newTime === oldTime) {
        console.log('选择的等时圈与之前相同，跳过重新计算交集。');
        return;
    }

    // 加载新的等时圈或时间发生变化时，重新加载
    if (newIsochrones.length && newTime) {
        let allCoordinates = [];
        let allGeojsonData = []; // 用于存储所有等时圈的 GeoJSON 数据

        for (const isochrone of newIsochrones) {
            await loadIsochroneAndBlocks(isochrone, allCoordinates, allGeojsonData);
            await loadStationEntrances(isochrone); // 加载入口
        }

        // 手动计算边界并适应视图
        if (allCoordinates.length > 0) {
            let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

            allCoordinates.forEach(([lng, lat]) => {
                if (typeof lng === 'number' && typeof lat === 'number') {
                    minLng = Math.min(minLng, lng);
                    minLat = Math.min(minLat, lat);
                    maxLng = Math.max(maxLng, lng);
                    maxLat = Math.max(maxLat, lat);
                }
            });

            if (minLng !== Infinity && minLat !== Infinity && maxLng !== -Infinity && maxLat !== -Infinity) {
                nextTick(() => {
                    try {
                        map.value.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 20, maxZoom: 14 });
                    } catch (fitBoundsError) {
                        console.error('Error during fitBounds execution:', fitBoundsError);
                    }
                });
            } else {
                console.warn('手动计算的边界值无效，无法进行 fitBounds');
            }
        }

        // 调用 drawIntersection 重新计算和绘制交集
        drawIntersection(allGeojsonData);

        // 更新缓存
        lastSelectedIsochrones = [...newIsochrones];
    } else {
        // 如果没有有效的等时圈，清空当前交集
        clearIntersectionLayer();
        lastSelectedIsochrones = []; // 清空缓存
    }
});



// 用于比较两个数组是否相等的函数
const arraysEqual = (arr1, arr2) => {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((value, index) => value === arr2[index]);
};



// loadIsochroneAndBlocks 函数
const loadIsochroneAndBlocks = async (isochrone, allCoordinates, allGeojsonData) => {
    let geojsonData;

    try {
        if (!isochrone || !selectedTime.value) {
            throw new Error('请先选择等时圈和时间。');
        }

        // 根据选择的时间确定 API 路径
        const timeValue = selectedTime.value === '5分钟' ? '_5' : '_10';
        const isochroneUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(isochrone)}/${encodeURIComponent(isochrone)}${timeValue}/`;

        const response = await fetch(isochroneUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch isochrone data');
        }

        const data = await response.json();
        console.log('等时圈数据:', data);

        // 解析返回的字符串坐标数组
        let coordinates;
        try {
            coordinates = JSON.parse(data[0]); // 解析 JSON 字符串为数组
            if (!Array.isArray(coordinates) || coordinates.length < 3) {
                throw new Error('坐标数据无效或点数不足，无法绘制多边形');
            }

            // 确保多边形闭合
            if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
                coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
                coordinates.push(coordinates[0]);
            }

            allCoordinates.push(...coordinates);

            // 构建 GeoJSON 数据
            geojsonData = {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                }
            };

            allGeojsonData.push(geojsonData);
        } catch (parseError) {
            console.error('坐标数据解析错误:', parseError);
            return;
        }

        // 绘制或更新地图上的图层
        const layerId = `isochrone-layer-${isochrone}`;
        if (map.value.getSource(layerId)) {
            map.value.getSource(layerId).setData(geojsonData);
        } else {
            map.value.addSource(layerId, {
                type: 'geojson',
                data: geojsonData
            });

            map.value.addLayer({
                id: `${layerId}-fill`,
                type: 'fill',
                source: layerId,
                paint: {
                    'fill-color': '#888888',
                    'fill-opacity': 0.5
                }
            });

            map.value.addLayer({
                id: `${layerId}-line`,
                type: 'line',
                source: layerId,
                paint: {
                    'line-color': '#000000',
                    'line-width': 2
                }
            });
        }

        // 获取地块名称
        const blockUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(isochrone)}/${encodeURIComponent(isochrone)}${timeValue}/block/`;
        const blockResponse = await fetch(blockUrl);
        if (!blockResponse.ok) {
            throw new Error('Failed to fetch block data');
        }

        blockNames.value[isochrone] = await blockResponse.json() || [];

        // 计算交集并绘制
        drawIntersection(allGeojsonData);

        // 更新地块颜色
        updateBlockColors();
    } catch (error) {
        console.error('加载等时圈数据时出错:', error);
    }

    console.log('已加载的等时圈 GeoJSON 数据:', allGeojsonData);
};

//绘制交集
const drawIntersection = (allGeojsonData) => {
    // 清除上次计算的交集图层
    clearIntersectionLayer();

    // 直接重新计算所有交集
    calculateFullIntersection(allGeojsonData);
};



// 重新计算所有交集的函数
const calculateFullIntersection = (allGeojsonData) => {
    const reader = new jsts.io.GeoJSONReader();
    const writer = new jsts.io.GeoJSONWriter();

    console.log('开始交集计算, 等时圈总数:', allGeojsonData.length);

    // 遍历所有等时圈，逐对计算交集
    for (let i = 0; i < allGeojsonData.length; i++) {
        const polygon1GeoJson = allGeojsonData[i].geometry;
        const bbox1 = turf.bbox(polygon1GeoJson); // 获取第一个多边形的 Bounding Box

        for (let j = i + 1; j < allGeojsonData.length; j++) {
            const polygon2GeoJson = allGeojsonData[j].geometry;
            const bbox2 = turf.bbox(polygon2GeoJson); // 获取第二个多边形的 Bounding Box

            // 首先通过 Bounding Box 判断是否可能相交
            if (bboxOverlap(bbox1, bbox2)) {
                console.log(`多边形 ${i} 和 ${j} 的 Bounding Box 重叠，进行进一步相交判断`);

                const polygon1 = reader.read(polygon1GeoJson);
                const polygon2 = reader.read(polygon2GeoJson);

                // 检查两个多边形是否有交集
                if (polygon1.intersects(polygon2)) {
                    console.log(`多边形 ${i} 和 ${j} 存在交集`);

                    // 计算交集
                    const intersection = polygon1.intersection(polygon2);

                    // 如果交集有效（非空），则绘制
                    if (!intersection.isEmpty()) {
                        const intersectionGeoJson = writer.write(intersection);
                        const intersectionLayerId = `intersection-layer-${i}-${j}`;

                        // 如果该 source 和 layer 不存在，才进行添加
                        if (!map.value.getSource(intersectionLayerId)) {
                            console.log(`添加交集图层: ${intersectionLayerId}`);

                            // 添加新的 source
                            map.value.addSource(intersectionLayerId, {
                                type: 'geojson',
                                data: intersectionGeoJson
                            });

                            // 添加填充图层
                            map.value.addLayer({
                                id: intersectionLayerId,
                                type: 'fill',
                                source: intersectionLayerId,
                                paint: {
                                    'fill-color': '#FF0000', // 统一使用红色
                                    'fill-opacity': 0.6
                                }
                            });

                            // 添加边框线图层
                            map.value.addLayer({
                                id: `${intersectionLayerId}-line`,
                                type: 'line',
                                source: intersectionLayerId,
                                paint: {
                                    'line-color': '#000000', // 线条为黑色
                                    'line-width': 2
                                }
                            });
                        } else {
                            console.log(`交集图层已存在: ${intersectionLayerId}`);
                        }
                    } else {
                        console.warn(`多边形 ${i} 和 ${j} 之间没有有效的交集`);
                    }
                } else {
                    console.warn(`多边形 ${i} 和 ${j} 不相交，跳过该配对。`);
                }
            } else {
                console.warn(`多边形 ${i} 和 ${j} 的 Bounding Box 不重叠，跳过。`);
            }
        }
    }
};

// 函数：判断两个 Bounding Box 是否有重叠
const bboxOverlap = (bbox1, bbox2) => {
    return !(
        bbox1[2] < bbox2[0] ||  // bbox1 的右边界小于 bbox2 的左边界
        bbox1[0] > bbox2[2] ||  // bbox1 的左边界大于 bbox2 的右边界
        bbox1[3] < bbox2[1] ||  // bbox1 的上边界小于 bbox2 的下边界
        bbox1[1] > bbox2[3]     // bbox1 的下边界大于 bbox2 的上边界
    );
};



// 清除交集图层
const clearIntersectionLayer = () => {
    if (!map.value || !map.value.isStyleLoaded()) {
        console.warn('地图尚未完全加载，无法清除交集图层');
        return; // 地图尚未加载，返回
    }

    const layers = map.value.getStyle().layers;
    if (layers) {
        layers.forEach((layer) => {
            if (layer.id.includes('intersection-layer')) {
                map.value.removeLayer(layer.id);
            }
        });
    }

    const sources = map.value.getStyle().sources;
    if (sources) {
        Object.keys(sources).forEach((sourceId) => {
            if (sourceId.includes('intersection-layer')) {
                map.value.removeSource(sourceId);
            }
        });
    }
};




// 隐藏并移除当前等时圈所属的地块图层
const hideAndRemoveCurrentBlocks = (isochrone) => {
    const blocks = blockNames.value[isochrone];
    if (Array.isArray(blocks)) {
        blocks.forEach(block => {
            const colorLayerId = `block-fill-${isochrone}-${block}`;
            if (map.value.getLayer(colorLayerId)) {
                map.value.removeLayer(colorLayerId);
            }
            if (map.value.getSource(colorLayerId)) {
                map.value.removeSource(colorLayerId);
            }
        });
    }

    // 移除等时圈的图层
    const layerId = `isochrone-layer-${isochrone}`;
    if (map.value.getLayer(`${layerId}-fill`)) {
        map.value.removeLayer(`${layerId}-fill`);
    }
    if (map.value.getLayer(`${layerId}-line`)) {
        map.value.removeLayer(`${layerId}-line`);
    }
    if (map.value.getSource(layerId)) {
        map.value.removeSource(layerId);
    }

    // 移除与该等时圈相关的交集图层
    const layers = map.value.getStyle().layers;
    if (layers) {
        layers.forEach((layer) => {
            if (layer.id.includes(`intersection-layer-${isochrone}`)) {
                map.value.removeLayer(layer.id);
            }
        });
    }

    const sources = map.value.getStyle().sources;
    if (sources) {
        Object.keys(sources).forEach((sourceId) => {
            if (sourceId.includes(`intersection-layer-${isochrone}`)) {
                map.value.removeSource(sourceId);
            }
        });
    }

    // 移除对应的地块名称
    delete blockNames.value[isochrone];
};


// 更新地块颜色
const updateBlockColors = async () => {
    try {
        if (!map.value) {
            throw new Error('地图尚未初始化');
        }

        const timeValue = selectedTime.value === '5分钟' ? '_5' : '_10';

        // 遍历每个等时圈
        for (const isochrone in blockNames.value) {
            const blocks = blockNames.value[isochrone]; // 获取当前等时圈的地块数组

            // 检查 blocks 是否为数组
            if (!Array.isArray(blocks)) {
                console.warn(`blockNames.value[${isochrone}] 不是一个数组，跳过处理。`);
                continue;
            }

            // 统一获取所有地块的坐标和属性
            const locationPromises = blocks.map(block => {
                const locationUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(isochrone)}/${encodeURIComponent(isochrone)}${timeValue}/${encodeURIComponent(block)}/location`;
                return fetch(locationUrl).then(res => res.json());
            });

            const propertyUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(isochrone)}/${encodeURIComponent(isochrone)}${timeValue}/block/${encodeURIComponent(selectedProperty.value)}`;
            const propertyResponse = await fetch(propertyUrl);
            if (!propertyResponse.ok) {
                throw new Error(`Failed to fetch ${selectedProperty.value} for blocks`);
            }
            const propertyValues = await propertyResponse.json();

            const locations = await Promise.all(locationPromises);

            // 批量更新所有地块的颜色
            blocks.forEach((block, index) => {
                const locationData = locations[index];
                if (!locationData || !locationData[0]) {
                    console.error(`Invalid location data for block: ${block}`);
                    return;
                }

                const property = propertyValues[index] ? parseFloat(propertyValues[index]) : 0; // 如果获取不到值，默认为 0

                const geojsonBlockData = {
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [JSON.parse(locationData[0])] // 地块坐标
                    },
                    properties: {
                        [selectedProperty.value]: property // 动态设置属性值
                    }
                };

                const colorLayerId = `block-fill-${isochrone}-${block}`;
                if (!map.value.getSource(colorLayerId)) {
                    map.value.addSource(colorLayerId, {
                        type: 'geojson',
                        data: geojsonBlockData
                    });

                    map.value.addLayer({
                        id: colorLayerId,
                        type: 'fill',
                        source: colorLayerId,
                        paint: {
                            'fill-color': getColorInterpolation(selectedProperty.value), // 根据选择的属性动态应用颜色
                            'fill-opacity': showBlocks.value ? 0.6 : 0 // 根据滑块控制显示和隐藏
                        }
                    });
                } else {
                    map.value.getSource(colorLayerId).setData(geojsonBlockData);
                    map.value.setPaintProperty(colorLayerId, 'fill-color', getColorInterpolation(selectedProperty.value));
                    map.value.setPaintProperty(colorLayerId, 'fill-opacity', showBlocks.value ? 0.6 : 0);
                }
            });
        }
    } catch (error) {
        console.error('更新地块颜色时出错:', error);
    }
};



// 切换地块显示/隐藏状态
const toggleBlockVisibility = () => {
    Object.keys(blockNames.value).forEach(isochrone => {
        const blocks = blockNames.value[isochrone];
        if (Array.isArray(blocks)) { // 检查 blocks 是否为数组
            blocks.forEach(block => {
                const colorLayerId = `block-fill-${isochrone}-${block}`;
                if (map.value.getLayer(colorLayerId)) {
                    map.value.setPaintProperty(colorLayerId, 'fill-opacity', showBlocks.value ? 0.6 : 0);
                }
            });
        } else {
            console.warn(`blockNames.value[${isochrone}] is not an array.`);
        }
    });
};

const getColorInterpolation = (criteria) => {
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
};

// 加载站点出入口
const loadStationEntrances = async (isochrone) => {
    try {
        const city = 'Nanjing'; // 替换为实际城市名称
        const entranceUrl = `${backendUrl}/query/${city}/${encodeURIComponent(isochrone)}/entrance_locations`;

        const response = await fetch(entranceUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch entrance locations');
        }
        const entrances = await response.json();

        // 解析并可视化出入口
        visualizeEntrances(isochrone, entrances);
    } catch (error) {
        console.error('Error fetching entrance locations:', error);
    }
};

// 可视化出入口
const visualizeEntrances = (isochrone, entrances) => {
    // 清除之前该等时圈的入口标记
    if (entranceMarkersMap[isochrone]) {
        entranceMarkersMap[isochrone].forEach(marker => marker.remove());
    }

    // 处理坐标数据
    let coordinates;
    try {
        const formattedData = entrances[0]
            .replace(/\(/g, '[')
            .replace(/\)/g, ']')
            .replace(/\'/g, '"');

        coordinates = JSON.parse(formattedData); // 解析为 JSON 数组
    } catch (parseError) {
        console.error('坐标数据解析错误:', parseError);
        return;
    }

    // 创建新的入口标记数组
    const markers = [];
    coordinates.forEach(([lng, lat]) => {
        if (typeof lng === 'number' && typeof lat === 'number') {
            // 添加点到地图上，带有标题
            const marker = new maplibregl.Marker({ color: 'red', title: 'Entrance Marker' }) // 设置标题
                .setLngLat([lng, lat])
                .setPopup(new maplibregl.Popup().setText(`Entrance at ${lng}, ${lat}`)) // 添加弹出窗口
                .addTo(map.value);

            // 添加点击事件以显示站点名称
            marker.getElement().addEventListener('click', () => {
                new maplibregl.Popup()
                    .setLngLat([lng, lat])
                    .setHTML(`<strong>站点名称:</strong> ${isochrone}`)
                    .addTo(map.value);
            });

            // 存储标记
            markers.push(marker);
        }
    });

    // 将该等时圈的入口标记存储到对象中
    entranceMarkersMap[isochrone] = markers;
};


// 卸载等时圈对应的入口
const unloadStationEntrances = (isochrone) => {
    if (entranceMarkersMap[isochrone]) {
        entranceMarkersMap[isochrone].forEach(marker => marker.remove());
        delete entranceMarkersMap[isochrone]; // 移除存储的入口标记
    }
};



</script>

<style scoped>
.map-wrap {
    position: relative;
    width: 100%;
    height: calc(100vh - 77px);
    /* 保持地图高度 */
}

.map {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
}

.control-panel {
    position: absolute;
    top: 10px;
    right: 50px;
    z-index: 1000;
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    background-color: #ffffff;
    width: 320px;
    transition: all 0.3s ease;
    max-height: 600px;
    opacity: 1;
    overflow: hidden;
    border: 1px solid #e6e6e6;
}

.control-panel.collapsed {
    max-height: 50px;
    opacity: 0.9;
    overflow: hidden;
}

.toggle-panel-btn {
    display: flex;
    justify-content: center;
    margin-bottom: 10px;
}

.el-button {
    transition: all 0.3s ease;
    border-radius: 10px;
    padding: 12px 24px;
    /* 统一内边距 */
    font-size: 16px;
    background-color: #409eff;
    color: #fff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: 2px solid transparent;
    /* 去掉内外框的视觉差异 */
    cursor: pointer;
}

.el-button:hover {
    background-color: #66b1ff;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    /* 提高阴影效果，增加立体感 */
    transform: translateY(-2px);
    /* 增加微小的上移效果 */
    border: 2px solid #66b1ff;
    /* 统一外框颜色为 hover 状态 */
}

.el-button:active {
    background-color: #3a8ee6;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    /* 减少阴影，按压效果 */
    transform: translateY(0);
    /* 移除上移效果 */
    border: 2px solid #3a8ee6;
    /* 统一 active 状态下的外框颜色 */
}

.el-button:focus {
    outline: none;
    border: 2px solid #66b1ff;
    /* 焦点状态下的外框颜色 */
}

.el-button.is-disabled {
    background-color: #d3d3d3;
    color: #ffffff;
    cursor: not-allowed;
    box-shadow: none;
    /* 禁用时无阴影效果 */
    border: 2px solid #d3d3d3;
    /* 统一禁用状态的外框 */
}

.el-button.is-disabled:hover,
.el-button.is-disabled:active {
    background-color: #d3d3d3;
    box-shadow: none;
    transform: none;
    border: 2px solid #d3d3d3;
    /* 保持禁用状态下的一致外框 */
}

.selector-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

/* 城市选择器样式 */
.city-selector {
    flex: 1;
}

.geojson-selector {
    flex: 1;
}

.time-selector {
    display: flex;
    justify-content: space-between;
    width: 100%;
}

.el-radio-button {
    flex: 1;
    justify-content: center;
    background-color: #f5f7fa;
    color: #409eff;
    transition: background-color 0.3s, color 0.3s;
    border-radius: 8px;
    border: 1px solid #dcdfe6;
}

.el-radio-button:hover {
    background-color: #e6f0ff;
}

.el-radio-button.is-active {
    background-color: #409eff;
    color: #fff;
}

.el-radio-button.is-active:hover {
    background-color: #66b1ff;
}

/* 等时圈选择框样式 */
.isochrone-selector {
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid #e0e0e0;
    padding: 12px;
    border-radius: 12px;
    background-color: #ffffff;
    width: 100%;
    box-sizing: border-box;
}

.block-visibility-toggle {
    margin-top: 20px;
}

.el-select .el-input {
    border-radius: 10px;
}

.el-select-dropdown {
    border-radius: 10px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* 增加全局字体样式优化 */
body {
    font-family: 'Roboto', sans-serif;
    color: #333;
    line-height: 1.6;
}
</style>
