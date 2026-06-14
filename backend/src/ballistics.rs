use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BallisticInput {
    pub initial_velocity: f64,
    pub launch_angle_deg: f64,
    pub projectile_mass_kg: f64,
    pub projectile_diameter_m: f64,
    pub air_density_kgm3: f64,
    pub wind_speed_mps: f64,
    pub wind_direction_deg: f64,
    pub launch_height_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrajectoryPoint {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub velocity: f64,
    pub time_s: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BallisticResult {
    pub max_height_m: f64,
    pub range_m: f64,
    pub flight_time_s: f64,
    pub impact_velocity_mps: f64,
    pub impact_kinetic_energy_j: f64,
    pub trajectory: Vec<TrajectoryPoint>,
    pub impact_angle_deg: f64,
}

const GRAVITY: f64 = 9.81;
const DRAG_COEFFICIENT: f64 = 0.47;
const TIME_STEP: f64 = 0.01;

fn drag_force(velocity_mag: f64, cross_section: f64, air_density: f64) -> f64 {
    0.5 * air_density * velocity_mag * velocity_mag * DRAG_COEFFICIENT * cross_section
}

pub fn simulate_ballistics(input: &BallisticInput) -> BallisticResult {
    let angle_rad = input.launch_angle_deg.to_radians();
    let wind_rad = input.wind_direction_deg.to_radians();

    let mut vx = input.initial_velocity * angle_rad.cos();
    let mut vy = input.initial_velocity * angle_rad.sin();
    let mut vz = 0.0;

    let wind_x = input.wind_speed_mps * wind_rad.cos();
    let wind_z = input.wind_speed_mps * wind_rad.sin();

    let radius = input.projectile_diameter_m / 2.0;
    let cross_section = std::f64::consts::PI * radius * radius;

    let mut x = 0.0;
    let mut y = input.launch_height_m;
    let mut z = 0.0;
    let mut t = 0.0;

    let mut trajectory = Vec::new();
    let mut max_height = input.launch_height_m;

    trajectory.push(TrajectoryPoint {
        x,
        y,
        z,
        velocity: input.initial_velocity,
        time_s: t,
    });

    while y >= 0.0 {
        let rel_vx = vx - wind_x;
        let rel_vy = vy;
        let rel_vz = vz - wind_z;

        let rel_vel_mag = (rel_vx * rel_vx + rel_vy * rel_vy + rel_vz * rel_vz).sqrt();

        let drag = if rel_vel_mag > 0.001 {
            drag_force(rel_vel_mag, cross_section, input.air_density_kgm3) / input.projectile_mass_kg
        } else {
            0.0
        };

        let drag_ax = -drag * rel_vx / rel_vel_mag.max(0.001);
        let drag_ay = -drag * rel_vy / rel_vel_mag.max(0.001);
        let drag_az = -drag * rel_vz / rel_vel_mag.max(0.001);

        let ax = drag_ax;
        let ay = drag_ay - GRAVITY;
        let az = drag_az;

        vx += ax * TIME_STEP;
        vy += ay * TIME_STEP;
        vz += az * TIME_STEP;

        x += vx * TIME_STEP;
        y += vy * TIME_STEP;
        z += vz * TIME_STEP;
        t += TIME_STEP;

        if y > max_height {
            max_height = y;
        }

        let velocity = (vx * vx + vy * vy + vz * vz).sqrt();
        trajectory.push(TrajectoryPoint {
            x,
            y,
            z,
            velocity,
            time_s: t,
        });

        if t > 60.0 {
            break;
        }
    }

    let last = trajectory.last().unwrap();
    let second_last = trajectory.get(trajectory.len().saturating_sub(2)).unwrap_or(last);

    let impact_velocity = last.velocity;
    let impact_kinetic_energy = 0.5 * input.projectile_mass_kg * impact_velocity * impact_velocity;

    let impact_angle = if last.x != second_last.x {
        ((last.y - second_last.y) / (last.x - second_last.x).max(0.001)).atan().to_degrees().abs()
    } else {
        90.0
    };

    let range = (last.x * last.x + last.z * last.z).sqrt();

    BallisticResult {
        max_height_m: max_height,
        range_m: range,
        flight_time_s: t,
        impact_velocity_mps: impact_velocity,
        impact_kinetic_energy_j: impact_kinetic_energy,
        trajectory,
        impact_angle_deg: impact_angle,
    }
}

pub fn estimate_projectile_diameter(mass_kg: f64, density_kgm3: f64) -> f64 {
    let volume = mass_kg / density_kgm3;
    let radius = (3.0 * volume / (4.0 * std::f64::consts::PI)).powf(1.0 / 3.0);
    2.0 * radius
}

pub fn stone_density() -> f64 {
    2600.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_ballistics() {
        let input = BallisticInput {
            initial_velocity: 50.0,
            launch_angle_deg: 45.0,
            projectile_mass_kg: 90.0,
            projectile_diameter_m: 0.4,
            air_density_kgm3: 1.225,
            wind_speed_mps: 0.0,
            wind_direction_deg: 0.0,
            launch_height_m: 5.0,
        };

        let result = simulate_ballistics(&input);
        assert!(result.range_m > 100.0);
        assert!(result.max_height_m > 50.0);
        assert!(result.flight_time_s > 5.0);
        assert!(result.impact_kinetic_energy_j > 1000.0);
    }

    #[test]
    fn test_diameter_calculation() {
        let d = estimate_projectile_diameter(90.0, 2600.0);
        assert!(d > 0.3 && d < 0.5);
    }
}
