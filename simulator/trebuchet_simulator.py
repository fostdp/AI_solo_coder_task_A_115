#!/usr/bin/env python3
"""
古代投石机传感器模拟器
每台投石机每1分钟通过UDP上报传感器数据
"""

import json
import socket
import time
import random
import math
import argparse
from datetime import datetime, timezone

TREBUCHETS = [
    {"id": 1, "name": "回回炮-甲", "type": "配重式", "counterweight_kg": 3000, "projectile_kg": 90, "arm_length_m": 12.0, "max_angle_deg": 50.0},
    {"id": 2, "name": "回回炮-乙", "type": "配重式", "counterweight_kg": 5000, "projectile_kg": 150, "arm_length_m": 15.0, "max_angle_deg": 55.0},
    {"id": 3, "name": "襄阳砲-壹", "type": "配重式", "counterweight_kg": 4000, "projectile_kg": 120, "arm_length_m": 13.5, "max_angle_deg": 52.0},
    {"id": 4, "name": "人力砲-一号", "type": "人力牵引式", "counterweight_kg": 0, "projectile_kg": 30, "arm_length_m": 8.0, "max_angle_deg": 45.0},
    {"id": 5, "name": "人力砲-二号", "type": "人力牵引式", "counterweight_kg": 0, "projectile_kg": 25, "arm_length_m": 7.5, "max_angle_deg": 42.0},
    {"id": 6, "name": "旋风砲", "type": "人力牵引式", "counterweight_kg": 0, "projectile_kg": 20, "arm_length_m": 6.0, "max_angle_deg": 48.0},
    {"id": 7, "name": "虎蹲砲", "type": "配重式", "counterweight_kg": 1500, "projectile_kg": 50, "arm_length_m": 9.0, "max_angle_deg": 47.0},
    {"id": 8, "name": "无敌砲", "type": "配重式", "counterweight_kg": 6000, "projectile_kg": 200, "arm_length_m": 18.0, "max_angle_deg": 58.0},
    {"id": 9, "name": "飞云砲", "type": "人力牵引式", "counterweight_kg": 0, "projectile_kg": 15, "arm_length_m": 5.5, "max_angle_deg": 40.0},
    {"id": 10, "name": "震天雷砲", "type": "配重式", "counterweight_kg": 8000, "projectile_kg": 300, "arm_length_m": 20.0, "max_angle_deg": 60.0},
]

GRAVITY = 9.81
STONE_DENSITY = 2600.0


def estimate_velocity(trebuchet, angle_deg):
    """基于能量守恒估算初速"""
    if trebuchet["type"] == "配重式":
        counterweight = trebuchet["counterweight_kg"]
        projectile = trebuchet["projectile_kg"]
        arm = trebuchet["arm_length_m"]
        angle_rad = math.radians(angle_deg)

        height_drop = arm * (1 - math.cos(angle_rad))
        potential_energy = counterweight * GRAVITY * height_drop * 0.7
        velocity = math.sqrt(2 * potential_energy / projectile)
        return velocity * random.uniform(0.9, 1.1)
    else:
        pullers = int(trebuchet["projectile_kg"] * 3)
        force_per_puller = 500
        total_force = pullers * force_per_puller
        work = total_force * trebuchet["arm_length_m"] * 0.5
        velocity = math.sqrt(2 * work / trebuchet["projectile_kg"])
        return velocity * random.uniform(0.85, 1.15)


def estimate_tension(trebuchet, angle_deg):
    """估算拉索张力"""
    if trebuchet["type"] == "配重式":
        base_tension = trebuchet["counterweight_kg"] * GRAVITY * 1.5
    else:
        pullers = int(trebuchet["projectile_kg"] * 3)
        base_tension = pullers * 500

    angle_factor = math.sin(math.radians(angle_deg)) + 0.5
    return base_tension * angle_factor * random.uniform(0.95, 1.05)


def generate_sensor_data(trebuchet, base_angle=None):
    """生成传感器数据"""
    if base_angle is None:
        base_angle = trebuchet["max_angle_deg"] * random.uniform(0.7, 0.95)

    angle = base_angle + random.uniform(-2, 2)
    angle = max(20, min(angle, trebuchet["max_angle_deg"]))

    velocity = estimate_velocity(trebuchet, angle)
    tension = estimate_tension(trebuchet, angle)

    wind_speed = random.uniform(0, 15)
    wind_direction = random.uniform(0, 360)
    temperature = random.uniform(5, 35)

    air_density = 1.293 * (273.15 / (273.15 + temperature)) * 0.98

    return {
        "trebuchet_id": trebuchet["id"],
        "cable_tension_newton": round(tension, 2),
        "launch_angle_deg": round(angle, 2),
        "initial_velocity_mps": round(velocity, 2),
        "wind_speed_mps": round(wind_speed, 2),
        "wind_direction_deg": round(wind_direction, 2),
        "temperature_c": round(temperature, 2),
        "air_density_kgm3": round(air_density, 4),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def send_udp(sock, host, port, data):
    """发送UDP数据包"""
    message = json.dumps(data).encode("utf-8")
    sock.sendto(message, (host, port))


def run_simulation(host, port, interval_seconds, count):
    """运行模拟"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    print(f"投石机模拟器启动")
    print(f"目标: {host}:{port}")
    print(f"间隔: {interval_seconds}秒")
    print(f"投石机数量: {len(TREBUCHETS)}")
    print("=" * 60)

    iteration = 0
    try:
        while True:
            iteration += 1
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"\n[{ts}] 第 {iteration} 轮发射...")

            for i, trebuchet in enumerate(TREBUCHETS):
                data = generate_sensor_data(trebuchet)
                send_udp(sock, host, port, data)

                if i < 3:
                    print(f"  [{trebuchet['name']}] 角度: {data['launch_angle_deg']}° "
                          f"初速: {data['initial_velocity_mps']}m/s "
                          f"张力: {data['cable_tension_newton']:.0f}N")

            if count > 0 and iteration >= count:
                print(f"\n完成 {count} 轮模拟")
                break

            time.sleep(interval_seconds)

    except KeyboardInterrupt:
        print("\n\n模拟已停止")
    finally:
        sock.close()


def main():
    parser = argparse.ArgumentParser(description="古代投石机传感器模拟器")
    parser.add_argument("--host", default="127.0.0.1", help="UDP目标主机")
    parser.add_argument("--port", type=int, default=9001, help="UDP目标端口")
    parser.add_argument("--interval", type=int, default=60, help="发送间隔(秒)")
    parser.add_argument("--count", type=int, default=0, help="发送轮数(0=无限)")
    parser.add_argument("--fast", action="store_true", help="快速模式(2秒间隔)")

    args = parser.parse_args()

    interval = 2 if args.fast else args.interval
    run_simulation(args.host, args.port, interval, args.count)


if __name__ == "__main__":
    main()
