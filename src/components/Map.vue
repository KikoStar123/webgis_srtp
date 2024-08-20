<template>
    <div class="map-wrap">
        <div class="map" ref="mapContainer"></div>
        <div class="control-panel">
            <div class="selector-container">
                <!-- 时间选择按钮组 -->
                <ElRadioGroup v-model="selectedTime" class="time-selector">
                    <ElRadioButton label="5分钟">5分钟</ElRadioButton>
                    <ElRadioButton label="10分钟">10分钟</ElRadioButton>
                </ElRadioGroup>

                <!-- 等时圈选择框 -->
                <ElSelect v-model="selectedIsochroneGeoJSON" class="geojson-selector" placeholder="请选择等时圈数据" filterable>
                    <ElOption v-for="fileObj in isochroneGeojsonFiles" :key="fileObj.key"
                        :label="fileObj.geojson.replace('.geojson', '')" :value="fileObj.key">
                    </ElOption>
                </ElSelect>

                <!-- 地块属性选择框 -->
                <ElSelect v-model="selectedProperty" class="geojson-selector" placeholder="请选择地块属性" filterable
                    @change="updateBlockColors">
                    <ElOption v-for="property in properties" :key="property" :label="property" :value="property">
                    </ElOption>
                </ElSelect>

                <!-- 地块显示/隐藏开关 -->
                <ElSwitch v-model="showBlocks" @change="toggleBlockVisibility" class="block-visibility-toggle"
                    active-text="显示地块" inactive-text="隐藏地块">
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
import 'element-plus/dist/index.css';

config.apiKey = 'nMI0OagfwxzpRVopD5sR';
config.unit = 'metric'; // 比例尺公制单位

const mapContainer = shallowRef(null);
const map = shallowRef(null);
const isochroneGeojsonFiles = ref([]); // 存储等时圈数据对象数组
const selectedIsochroneGeoJSON = ref(''); // 选择的等时圈GeoJSON文件
const previousIsochrone = ref(''); // 保存上一个等时圈的选择值
const selectedTime = ref(''); // 选择的时间（5分钟或10分钟）
const selectedProperty = ref('floorAreaRatio'); // 选择的属性，默认选择第一个属性
const showBlocks = ref(false); // 控制地块显示开关
const blockNames = ref([]); // 存储地块名称列表
const properties = ref(['floorAreaRatio', 'buildingDensity', 'avgHeight']); // 地块属性列表
const backendUrl = "http://47.101.210.178:3001"; // 调用全局分配的域名地址

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
        scaleControl: true // 比例尺
    });

    try {
        const response = await fetch(`${backendUrl}/query/Nanjing/station`);
        if (!response.ok) {
            throw new Error('Failed to fetch station data');
        }
        const stations = await response.json();
        isochroneGeojsonFiles.value = stations.map(station => ({
            key: station,
            geojson: station
        }));
    } catch (error) {
        console.error('Error fetching station data:', error);
    }
});

onUnmounted(() => {
    map.value?.remove();
});

// 监听等时圈和时间选择的变化
watch([selectedIsochroneGeoJSON, selectedTime], async ([isochrone, time], [oldIsochrone, oldTime]) => {
    // 当等时圈变化时，隐藏上一个等时圈的地块
    if (isochrone && oldIsochrone && isochrone !== oldIsochrone) {
        hideAndRemoveCurrentBlocks(); // 隐藏并移除上一个等时圈的地块
        previousIsochrone.value = isochrone; // 更新记录的上一个等时圈
    }

    // 当等时圈和时间都被选择后，加载新的数据
    if (isochrone && time) {
        await loadIsochroneAndBlocks();
    }
});

// 定义 loadIsochroneAndBlocks 函数
const loadIsochroneAndBlocks = async () => {
    try {
        if (!selectedIsochroneGeoJSON.value || !selectedTime.value) {
            throw new Error('请先选择等时圈和时间。');
        }

        // 根据选择的时间确定API路径
        const timeValue = selectedTime.value === '5分钟' ? '_5' : '_10';
        const isochroneUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(selectedIsochroneGeoJSON.value)}/${encodeURIComponent(selectedIsochroneGeoJSON.value)}${timeValue}/`;
        console.log(`Fetching Isochrone GeoJSON from: ${isochroneUrl}`);

        const response = await fetch(isochroneUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch isochrone data');
        }

        const data = await response.json();
        console.log('等时圈数据:', data);

        // 解析返回的字符串坐标数组
        let coordinates;
        try {
            coordinates = JSON.parse(data[0]);
            if (!Array.isArray(coordinates) || coordinates.length < 3) {
                throw new Error('坐标数据无效或点数不足，无法绘制多边形');
            }
            console.log('Parsed coordinates:', coordinates);

            // 确保多边形闭合（首尾点相同）
            if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
                coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
                coordinates.push(coordinates[0]); // 将首点追加到末尾以闭合多边形
            }
        } catch (parseError) {
            console.error('坐标数据解析错误:', parseError);
            return;
        }

        // 构建 GeoJSON 数据
        const geojsonData = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [coordinates] // 需要确保二维数组
            }
        };

        // 添加或更新地图上的图层
        if (map.value.getSource('isochrone')) {
            map.value.getSource('isochrone').setData(geojsonData);
        } else {
            map.value.addSource('isochrone', {
                type: 'geojson',
                data: geojsonData
            });

            map.value.addLayer({
                id: 'isochrone-fill',
                type: 'fill',
                source: 'isochrone',
                paint: {
                    'fill-color': '#888888',
                    'fill-opacity': 0.5
                }
            });

            map.value.addLayer({
                id: 'isochrone-line',
                type: 'line',
                source: 'isochrone',
                paint: {
                    'line-color': '#000000',
                    'line-width': 2
                }
            });
        }

        // 手动计算边界并适应视图
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

        coordinates.forEach(([lng, lat]) => {
            if (typeof lng === 'number' && typeof lat === 'number') {
                minLng = Math.min(minLng, lng);
                minLat = Math.min(minLat, lat);
                maxLng = Math.max(maxLng, lng);
                maxLat = Math.max(maxLat, lat);
            }
        });

        if (minLng === Infinity || minLat === Infinity || maxLng === -Infinity || maxLat === -Infinity) {
            console.warn('手动计算的边界值无效，无法进行 fitBounds');
        } else {
            map.value.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 20, maxZoom: 14 });
        }

        // 获取当前等时圈下的地块名称
        const blockUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(selectedIsochroneGeoJSON.value)}/${encodeURIComponent(selectedIsochroneGeoJSON.value)}${timeValue}/block/`;
        const blockResponse = await fetch(blockUrl);
        if (!blockResponse.ok) {
            throw new Error('Failed to fetch block data');
        }
        blockNames.value = await blockResponse.json();
        console.log('Fetched blocks:', blockNames.value);

        // 获取地块的属性并更新颜色
        updateBlockColors();

    } catch (error) {
        console.error('加载等时圈数据时出错:', error);
    }
};

// 隐藏并移除当前等时圈所属的地块图层
const hideAndRemoveCurrentBlocks = () => {
    blockNames.value.forEach(block => {
        const colorLayerId = `block-fill-${block}`;
        if (map.value.getLayer(colorLayerId)) {
            map.value.removeLayer(colorLayerId);
        }
        if (map.value.getSource(colorLayerId)) {
            map.value.removeSource(colorLayerId);
        }
    });
    blockNames.value = []; // 清空当前地块名称列表
};

// 更新地块颜色
const updateBlockColors = async () => {
    try {
        const timeValue = selectedTime.value === '5分钟' ? '_5' : '_10';

        // 统一获取所有地块的坐标和属性
        const locationPromises = blockNames.value.map(block => {
            const locationUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(selectedIsochroneGeoJSON.value)}/${encodeURIComponent(selectedIsochroneGeoJSON.value)}${timeValue}/${encodeURIComponent(block)}/location`;
            return fetch(locationUrl).then(res => res.json());
        });

        const propertyUrl = `${backendUrl}/query/Nanjing/${encodeURIComponent(selectedIsochroneGeoJSON.value)}/${encodeURIComponent(selectedIsochroneGeoJSON.value)}${timeValue}/block/${encodeURIComponent(selectedProperty.value)}`;
        const propertyResponse = await fetch(propertyUrl);
        if (!propertyResponse.ok) {
            throw new Error(`Failed to fetch ${selectedProperty.value} for blocks`);
        }
        const propertyValues = await propertyResponse.json();

        const locations = await Promise.all(locationPromises);

        // 批量更新所有地块的颜色
        blockNames.value.forEach((block, index) => {
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

            const colorLayerId = `block-fill-${block}`;
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
    } catch (error) {
        console.error('更新地块颜色时出错:', error);
    }
};


// 切换地块显示/隐藏状态
const toggleBlockVisibility = () => {
    blockNames.value.forEach(block => {
        const colorLayerId = `block-fill-${block}`;
        if (map.value.getLayer(colorLayerId)) {
            map.value.setPaintProperty(colorLayerId, 'fill-opacity', showBlocks.value ? 0.6 : 0);
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
    max-width: 800px;
}

.selector-container {
    display: flex;
    gap: 15px;
    align-items: center;
    /* 保证组件垂直居中对齐 */
    flex-wrap: nowrap;
    /* 防止组件换行 */
}

.geojson-selector {
    flex: 1;
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
