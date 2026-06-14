use crate::ballistics::{
    estimate_projectile_diameter, simulate_ballistics, BallisticInput, stone_density,
};
use crate::siege::{assess_siege_damage, SiegeInput, WallProperties};
use crate::storage::Database;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UdpSensorMessage {
    pub trebuchet_id: u32,
    pub cable_tension_newton: f64,
    pub launch_angle_deg: f64,
    pub initial_velocity_mps: f64,
    pub wind_speed_mps: f64,
    pub wind_direction_deg: f64,
    pub temperature_c: f64,
    pub air_density_kgm3: f64,
    pub timestamp: Option<DateTime<Utc>>,
}

pub async fn run_udp_server(
    bind_addr: &str,
    db: Arc<Database>,
    latest_results: Arc<Mutex<std::collections::HashMap<u32, crate::ballistics::BallisticResult>>>,
    latest_siege: Arc<Mutex<std::collections::HashMap<u32, crate::siege::SiegeAssessment>>>,
) -> Result<(), String> {
    let socket = UdpSocket::bind(bind_addr)
        .await
        .map_err(|e| format!("Failed to bind UDP socket: {}", e))?;

    println!("UDP server listening on {}", bind_addr);

    let mut buf = [0u8; 65535];

    loop {
        match socket.recv_from(&mut buf).await {
            Ok((len, _addr)) => {
                if let Ok(msg) = serde_json::from_slice::<UdpSensorMessage>(&buf[..len]) {
                    process_sensor_message(&db, msg, latest_results.clone(), latest_siege.clone())
                        .await;
                } else if let Ok(text) = std::str::from_utf8(&buf[..len]) {
                    if let Ok(msg) = serde_json::from_str::<UdpSensorMessage>(text) {
                        process_sensor_message(
                            &db,
                            msg,
                            latest_results.clone(),
                            latest_siege.clone(),
                        )
                        .await;
                    }
                }
            }
            Err(e) => {
                eprintln!("UDP receive error: {}", e);
            }
        }
    }
}

async fn process_sensor_message(
    db: &Database,
    msg: UdpSensorMessage,
    latest_results: Arc<Mutex<std::collections::HashMap<u32, crate::ballistics::BallisticResult>>>,
    latest_siege: Arc<Mutex<std::collections::HashMap<u32, crate::siege::SiegeAssessment>>>,
) {
    let timestamp = msg.timestamp.unwrap_or_else(Utc::now);

    let sensor_data = crate::storage::SensorData {
        timestamp,
        trebuchet_id: msg.trebuchet_id,
        cable_tension_newton: msg.cable_tension_newton,
        launch_angle_deg: msg.launch_angle_deg,
        initial_velocity_mps: msg.initial_velocity_mps,
        wind_speed_mps: msg.wind_speed_mps,
        wind_direction_deg: msg.wind_direction_deg,
        temperature_c: msg.temperature_c,
        air_density_kgm3: msg.air_density_kgm3,
    };

    if let Err(e) = db.insert_sensor_data(sensor_data).await {
        eprintln!("Failed to insert sensor data: {}", e);
        return;
    }

    if let Some(trebuchet) = db.get_trebuchet_by_id(msg.trebuchet_id).await {
        let projectile_diameter =
            estimate_projectile_diameter(trebuchet.projectile_kg, stone_density());

        let ballistic_input = BallisticInput {
            initial_velocity: msg.initial_velocity_mps,
            launch_angle_deg: msg.launch_angle_deg,
            projectile_mass_kg: trebuchet.projectile_kg,
            projectile_diameter_m: projectile_diameter,
            air_density_kgm3: msg.air_density_kgm3,
            wind_speed_mps: msg.wind_speed_mps,
            wind_direction_deg: msg.wind_direction_deg,
            launch_height_m: trebuchet.arm_length_m * 0.4,
        };

        let result = simulate_ballistics(&ballistic_input);

        {
            let mut results = latest_results.lock().await;
            results.insert(msg.trebuchet_id, result.clone());
        }

        if let Err(e) = db
            .insert_ballistics_result(
                msg.trebuchet_id,
                timestamp,
                msg.initial_velocity_mps,
                msg.launch_angle_deg,
                &result,
            )
            .await
        {
            eprintln!("Failed to insert ballistics result: {}", e);
        }

        let default_wall = WallProperties {
            thickness_m: 3.0,
            material: "rammed_earth".to_string(),
            density_kgm3: 1800.0,
            compressive_strength_pa: 2_000_000.0,
            tensile_strength_pa: 200_000.0,
        };

        let siege_input = SiegeInput {
            impact_energy_j: result.impact_kinetic_energy_j,
            projectile_mass_kg: trebuchet.projectile_kg,
            projectile_diameter_m: projectile_diameter,
            impact_angle_deg: result.impact_angle_deg,
            wall: default_wall.clone(),
        };

        let assessment = assess_siege_damage(&siege_input);

        {
            let mut siege = latest_siege.lock().await;
            siege.insert(msg.trebuchet_id, assessment.clone());
        }

        if let Err(e) = db
            .insert_siege_assessment(
                msg.trebuchet_id,
                default_wall.thickness_m,
                &default_wall.material,
                default_wall.density_kgm3,
                default_wall.compressive_strength_pa,
                result.impact_kinetic_energy_j,
                &assessment,
                45.0,
                msg.initial_velocity_mps,
            )
            .await
        {
            eprintln!("Failed to insert siege assessment: {}", e);
        }
    }
}
