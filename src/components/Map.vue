<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div class="control-panel">
            <div class="selector-container">
                <!-- 城市选择框 -->
                <ElSelect v-model="selectedCity" class="city-selector" placeholder="请选择城市" filterable @change="onCityChange">
                    <ElOption v-for="city in cities" :key="city" :label="city" :value="city">
                    </ElOption>
                </ElSelect>

                <!-- 时间选择按钮组 -->
                <ElRadioGroup v-model="selectedTime" class="time-selector">
                    <ElRadioButton label="5分钟">5分钟</ElRadioButton>
                    <ElRadioButton label="10分钟">10分钟</ElRadioButton>
                </ElRadioGroup>

                <!-- 等时圈选择框 -->
                <ElSelect v-model="selectedIsochroneGeoJSON" class="geojson-selector" placeholder="请选择等时圈数据" filterable multiple>
                    <ElOption v-for="fileObj in isochroneGeojsonFiles" :key="fileObj.key" :label="fileObj.geojson.replace('.geojson', '')" :value="fileObj.key">
                    </ElOption>
                </ElSelect>

                <!-- 地块属性选择框 -->
                <ElSelect v-model="selectedProperty" class="geojson-selector" placeholder="请选择地块属性" filterable @change="updateBlockColors">
                    <ElOption v-for="property in properties" :key="property" :label="property" :value="property">
                    </ElOption>
                </ElSelect>

                <!-- 地块显示/隐藏开关 -->
                <ElSwitch v-model="showBlocks" @change="toggleBlockVisibility" class="block-visibility-toggle" active-text="显示地块" inactive-text="隐藏地块">
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
import { ElSelect, ElOption, ElSwitch, ElRadioGroup, ElRadioButton } from 'element-plus';
import { nextTick } from 'vue';
//import * as turf from '@turf/turf'; // 导入 turf.js 库
//import jsts from 'jsts'; // 导入 JSTS 库
import * as jsts from 'jsts/dist/jsts.min.js';
import 'element-plus/dist/index.css';

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
const properties = ref(['floorAreaRatio', 'buildingDensity', 'avgHeight']); // 地块属性列表
const backendUrl = "http://47.101.210.178:3001"; // 调用全局分配的域名地址
let lastSelectedIsochrones = []; // 用于缓存上次计算交集的等时圈集合
// 入口数据可视化相关
const entranceMarkers = []; // 用于存储入口的标记，以便清除
const entranceMarkersMap = {}; // 用于存储每个等时圈的入口标记
const cities = ref([]); // 存储城市列表
const selectedCity = ref(''); // 当前选择的城市



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

    // 检查是否有至少两个图层，如果没有则不计算交集
    if (allGeojsonData.length < 2) {
        console.log('少于两个图层，无法计算交集。');
        return;
    }

    // 初始化交集为空，并设置找到交集的标志
    let intersection = null;
    let foundIntersection = false;

    // 计算交集
    for (let i = 0; i < allGeojsonData.length; i++) {
        const currentPolygon = reader.read(allGeojsonData[i].geometry);
        try {
            if (!intersection) {
                // 第一次设置交集为第一个多边形
                intersection = currentPolygon;
            } else if (intersection.intersects(currentPolygon)) {
                // 计算与已有交集的重叠部分
                intersection = intersection.intersection(currentPolygon);

                // 检查交集是否为空
                if (intersection.isEmpty()) {
                    console.warn('交集为空，停止计算。');
                    intersection = null;
                    break;
                }

                // 设置找到交集的标志
                foundIntersection = true;
            } else {
                console.warn('当前多边形与已有交集不重叠，跳过该多边形。');
            }
        } catch (error) {
            console.error(`交集计算失败:`, error);
            return;
        }
    }

    // 检查最终交集是否为空，或者未找到有效交集
    if (!intersection || !foundIntersection) {
        console.log('没有有效的交集，不进行渲染。');
        return;
    }

    // 将交集结果转换为 GeoJSON
    const intersectionGeoJson = writer.write(intersection);

    // 绘制新的交集图层
    map.value.addSource('intersection-layer', {
        type: 'geojson',
        data: intersectionGeoJson
    });

    map.value.addLayer({
        id: 'intersection-layer',
        type: 'fill',
        source: 'intersection-layer',
        paint: {
            'fill-color': '#ff0000',
            'fill-opacity': 0.6
        }
    });

    map.value.addLayer({
        id: 'intersection-layer-line',
        type: 'line',
        source: 'intersection-layer',
        paint: {
            'line-color': '#000000',
            'line-width': 2
        }
    });
};


// 清除交集图层
const clearIntersectionLayer = () => {
    const intersectionLayerId = 'intersection-layer';
    if (map.value.getSource(intersectionLayerId)) {
        map.value.removeLayer(intersectionLayerId);
        map.value.removeLayer(`${intersectionLayerId}-line`);
        map.value.removeSource(intersectionLayerId);
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
    height: calc(100vh - 77px); /* 保持地图高度 */
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
    left: 10px;
    z-index: 1000;
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    background-color: #ffffff;
    width: 100%;
    max-width: 900px; /* 增加面板的宽度以容纳更多控件 */
}

.selector-container {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: nowrap;
}

/* 城市选择器样式 */
.city-selector {
    flex: 1; /* 自适应宽度 */
}

.geojson-selector {
    flex: 1;
}

.time-selector {
    display: flex;
}

.block-visibility-toggle {
    margin-top: 15px;
}

.el-select .el-input {
    border-radius: 8px;
}

.el-select-dropdown {
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

</style>
