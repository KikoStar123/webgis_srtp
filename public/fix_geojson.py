'''
Author: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
Date: 2024-03-01 13:27:41
LastEditors: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
LastEditTime: 2024-03-01 13:30:27
FilePath: \py_test\fix_geojson.py
Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
'''
import json
import os
from shapely.geometry import shape, mapping
from shapely.ops import orient


def fix_geojson_file(file_path):
    print(f"Processing {file_path}...")
    with open(file_path, 'r', encoding='utf-8') as f:
        geojson = json.load(f)

    # 判断是否是Polygon或MultiPolygon类型
    if geojson['type'] in ['Polygon', 'MultiPolygon']:
        fixed_geometry = orient(shape(geojson), sign=1.0)
        fixed_geojson = mapping(fixed_geometry)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(fixed_geojson, f, ensure_ascii=False, indent=4)
        print(f"Fixed {file_path}")


def fix_geojson_directory(directory_path):
    for root, dirs, files in os.walk(directory_path):
        for file in files:
            if file.endswith('.geojson'):
                fix_geojson_file(os.path.join(root, file))


# 假设此脚本位于与city目录同级的位置
script_dir = os.path.dirname(os.path.abspath(__file__))  # 获取脚本所在目录的绝对路径
target_dir = os.path.join(script_dir, 'city', 'Nanjing')  # 构建目标目录路径

# 遍历Nanjing目录下的所有xxx_output子目录
for output_dir in os.listdir(target_dir):
    if output_dir.endswith('_output'):
        fix_geojson_directory(os.path.join(target_dir, output_dir))
