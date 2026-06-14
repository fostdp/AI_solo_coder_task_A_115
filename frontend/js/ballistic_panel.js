const API_BASE = "http://localhost:8080";

const MOCK_TREBUCHETS = [
    { id: 1,  name: "回回炮-甲",   type_: "配重式",     counterweight_kg: 3000, projectile_kg: 90,  arm_length_m: 12.0, max_angle_deg: 50.0 },
    { id: 2,  name: "回回炮-乙",   type_: "配重式",     counterweight_kg: 5000, projectile_kg: 150, arm_length_m: 15.0, max_angle_deg: 55.0 },
    { id: 3,  name: "襄阳砲-壹",   type_: "配重式",     counterweight_kg: 4000, projectile_kg: 120, arm_length_m: 13.5, max_angle_deg: 52.0 },
    { id: 4,  name: "人力砲-一号", type_: "人力牵引式", counterweight_kg: 0,    projectile_kg: 30,  arm_length_m: 8.0,  max_angle_deg: 45.0 },
    { id: 5,  name: "人力砲-二号", type_: "人力牵引式", counterweight_kg: 0,    projectile_kg: 25,  arm_length_m: 7.5,  max_angle_deg: 42.0 },
    { id: 6,  name: "旋风砲",     type_: "人力牵引式", counterweight_kg: 0,    projectile_kg: 20,  arm_length_m: 6.0,  max_angle_deg: 48.0 },
    { id: 7,  name: "虎蹲砲",     type_: "配重式",     counterweight_kg: 1500, projectile_kg: 50,  arm_length_m: 9.0,  max_angle_deg: 47.0 },
    { id: 8,  name: "无敌砲",     type_: "配重式",     counterweight_kg: 6000, projectile_kg: 200, arm_length_m: 18.0, max_angle_deg: 58.0 },
    { id: 9,  name: "飞云砲",     type_: "人力牵引式", counterweight_kg: 0,    projectile_kg: 15,  arm_length_m: 5.5,  max_angle_deg: 40.0 },
    { id: 10, name: "震天雷砲",   type_: "配重式",     counterweight_kg: 8000, projectile_kg: 300, arm_length_m: 20.0, max_angle_deg: 60.0 },
];

const MOCK_WALLS = [
    { id: 1, name: "夯土墙",       material: "rammed_earth",         thickness_m: 3.0, density_kgm3: 1800, compressive_strength_pa: 2000000,  tensile_strength_pa: 200000  },
    { id: 2, name: "包砖墙",       material: "brick_veneer",         thickness_m: 2.5, density_kgm3: 2000, compressive_strength_pa: 10000000, tensile_strength_pa: 800000  },
    { id: 3, name: "石砌墙",       material: "stone_masonry",        thickness_m: 4.0, density_kgm3: 2400, compressive_strength_pa: 25000000, tensile_strength_pa: 2000000 },
    { id: 4, name: "双层夯土墙",   material: "double_rammed_earth",  thickness_m: 6.0, density_kgm3: 1700, compressive_strength_pa: 1800000,  tensile_strength_pa: 180000  },
    { id: 5, name: "糯米灰浆墙",   material: "sticky_rice_lime",     thickness_m: 3.5, density_kgm3: 2100, compressive_strength_pa: 15000000, tensile_strength_pa: 1200000 },
];

class BallisticPanelController {
    constructor(sceneManager, particleSystem) {
        this.scene = sceneManager;
        this.particles = particleSystem;

        this.currentTrebuchetId = 1;
        this.currentWallId = 1;
        this.wallTypes = [];

        this.ballisticsResult = null;
        this.siegeResult = null;

        this.params = {
            velocity: 50,
            angle: 45,
            windSpeed: 0,
            windDirection: 0,
        };

        this.trebuchetData = null;

        this.bindEvents();
        this.loadInitialData();
    }

    bindEvents() {
        window.addEventListener('resize', () => this.scene.onWindowResize());

        document.getElementById('fireBtn').addEventListener('click', () => this.onFire());
        document.getElementById('optimizeBtn').addEventListener('click', () => this.onOptimize());

        this.bindSlider('velocitySlider', 'velocityValue', 'velocity');
        this.bindSlider('angleSlider', 'angleValue', 'angle', () => this.syncArmAngle());
        this.bindSlider('windSlider', 'windValue', 'windSpeed');

        ['viewTop', 'viewSide', 'view3d', 'viewReset'].forEach(id => {
            document.getElementById(id).addEventListener('click', () => {
                this.scene.setView(id.replace('view', '').toLowerCase());
            });
        });

        document.getElementById('popupClose').addEventListener('click', () => {
            document.getElementById('infoPopup').classList.remove('active');
        });

        this.scene.getCanvasDomElement().addEventListener('click', (e) => this.onCanvasClick(e));
    }

    bindSlider(sliderId, valueId, paramKey, onChangeExtra) {
        const slider = document.getElementById(sliderId);
        const valueEl = document.getElementById(valueId);
        slider.addEventListener('input', (e) => {
            this.params[paramKey] = parseFloat(e.target.value);
            valueEl.textContent = e.target.value;
            if (onChangeExtra) onChangeExtra();
        });
    }

    syncArmAngle() {
        this.scene.setTrebuchetArmAngle(this.currentTrebuchetId, this.params.angle);
    }

    async loadInitialData() {
        let trebuchetsLoaded = false;
        try {
            const response = await fetch(`${API_BASE}/api/trebuchets`);
            const data = await response.json();
            if (data.success && data.data) {
                this.trebuchetData = data.data;
                this.scene.createTrebuchets(data.data);
                this.renderTrebuchetList(data.data);
                this.updateConnectionStatus(true);
                trebuchetsLoaded = true;
            }
        } catch (e) {
            console.warn('Failed to load trebuchets from API, using mock data');
        }

        if (!trebuchetsLoaded) {
            this.updateConnectionStatus(false);
            this.trebuchetData = MOCK_TREBUCHETS;
            this.scene.createTrebuchets(MOCK_TREBUCHETS);
            this.renderTrebuchetList(MOCK_TREBUCHETS);
        }

        try {
            const response = await fetch(`${API_BASE}/api/walls`);
            const data = await response.json();
            if (data.success && data.data) {
                this.wallTypes = data.data;
                this.renderWallList(data.data);
            }
        } catch (e) {
            this.wallTypes = MOCK_WALLS;
            this.renderWallList(MOCK_WALLS);
        }
    }

    renderTrebuchetList(data) {
        const list = document.getElementById('trebuchetList');
        list.innerHTML = '';
        data.forEach(t => {
            const item = document.createElement('div');
            item.className = 'trebuchet-item' + (t.id === this.currentTrebuchetId ? ' active' : '');
            item.innerHTML = `
                <div class="name">${t.name}</div>
                <div class="type">${t.type_ || t.type}</div>
                <div class="stats">
                    <span>弹重: ${t.projectile_kg}kg</span>
                    <span>臂长: ${t.arm_length_m}m</span>
                </div>
            `;
            item.addEventListener('click', () => this.selectTrebuchet(t.id));
            list.appendChild(item);
        });
    }

    renderWallList(walls) {
        const selector = document.getElementById('wallSelector');
        selector.innerHTML = '';
        walls.forEach(w => {
            const item = document.createElement('div');
            item.className = 'wall-item' + (w.id === this.currentWallId ? ' active' : '');
            item.innerHTML = `
                <div>${w.name}</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                    厚度: ${w.thickness_m}m
                </div>
            `;
            item.addEventListener('click', () => this.selectWall(w.id));
            selector.appendChild(item);
        });
    }

    selectTrebuchet(id) {
        this.currentTrebuchetId = id;
        document.querySelectorAll('.trebuchet-item').forEach((el, idx) => {
            el.classList.toggle('active', this.trebuchetData[idx].id === id);
        });
        const t = this.trebuchetData.find(t => t.id === id);
        if (t) {
            document.getElementById('velocitySlider').max = Math.max(100, t.max_angle_deg * 2);
            this.syncArmAngle();
        }
    }

    selectWall(id) {
        this.currentWallId = id;
        document.querySelectorAll('.wall-item').forEach((el, idx) => {
            el.classList.toggle('active', this.wallTypes[idx].id === id);
        });
    }

    async onFire() {
        this.particles.clearAll();
        const tData = this.scene.findTrebuchetDataById(this.currentTrebuchetId);
        if (!tData) return;

        this.scene.animateTrebuchetFire(this.currentTrebuchetId, 500);

        setTimeout(async () => {
            try {
                const response = await fetch(
                    `${API_BASE}/api/calc/ballistics?velocity=${this.params.velocity}` +
                    `&angle=${this.params.angle}&mass=${tData.projectile_kg}` +
                    `&wind_speed=${this.params.windSpeed}&wind_direction=0`
                );
                const data = await response.json();
                if (data.success && data.data) {
                    this.ballisticsResult = data.data;
                    this.showTrajectory(data.data, tData);
                    this.updateHUD(data.data);
                    await this.calculateSiegeRemote(data.data, tData);
                    return;
                }
            } catch (e) {}

            const trajectory = this.calcLocalTrajectory(tData);
            this.showTrajectory(trajectory, tData);
            this.updateHUD(trajectory);
            this.calcLocalSiege(trajectory, tData);
        }, 300);
    }

    calcLocalTrajectory(tData) {
        const g = 9.81;
        const angleRad = this.params.angle * Math.PI / 180;
        const v0 = this.params.velocity;
        const points = [];
        const dt = 0.05;
        let t = 0;

        while (true) {
            const x = v0 * Math.cos(angleRad) * t;
            const y = 5 + v0 * Math.sin(angleRad) * t - 0.5 * g * t * t;
            if (y < 0 || t > 30) break;
            const velocity = Math.sqrt(
                Math.pow(v0 * Math.cos(angleRad), 2) +
                Math.pow(v0 * Math.sin(angleRad) - g * t, 2)
            );
            points.push({ x, y, z: 0, velocity, time_s: t });
            t += dt;
        }

        const last = points[points.length - 1];
        const impactVelocity = last ? last.velocity : v0;
        return {
            max_height_m: Math.max(...points.map(p => p.y)),
            range_m: last ? last.x : 0,
            flight_time_s: last ? last.time_s : 0,
            impact_velocity_mps: impactVelocity,
            impact_kinetic_energy_j: 0.5 * tData.projectile_kg * impactVelocity * impactVelocity,
            trajectory: points,
            impact_angle_deg: this.params.angle,
        };
    }

    calcLocalSiege(ballistics, tData) {
        const wall = this.wallTypes.find(w => w.id === this.currentWallId);
        if (!wall) return;

        const energy = ballistics.impact_kinetic_energy_j;
        const craterDepth = Math.min(wall.thickness_m * 0.8, (energy / 1000000) * 0.5);
        const damageRatio = Math.min(1, craterDepth / wall.thickness_m);
        const score = Math.min(100, damageRatio * 80 + (energy / 1000000) * 20);

        this.siegeResult = {
            crater_depth_m: craterDepth,
            crater_diameter_m: craterDepth * 2.5,
            damage_ratio: damageRatio,
            effectiveness_score: score,
            structural_damage: this.classifyDamage(damageRatio),
        };
        this.updateSiegeHUD(this.siegeResult);
    }

    async calculateSiegeRemote(ballistics, tData) {
        const wall = this.wallTypes.find(w => w.id === this.currentWallId);
        if (!wall) return;
        try {
            const response = await fetch(
                `${API_BASE}/api/calc/siege?impact_energy=${ballistics.impact_kinetic_energy_j}` +
                `&projectile_mass=${tData.projectile_kg}` +
                `&projectile_diameter=0.4` +
                `&impact_angle=${ballistics.impact_angle_deg}` +
                `&wall_thickness=${wall.thickness_m}` +
                `&wall_density=${wall.density_kgm3}` +
                `&wall_compressive_strength=${wall.compressive_strength_pa}` +
                `&wall_tensile_strength=${wall.tensile_strength_pa}`
            );
            const data = await response.json();
            if (data.success && data.data) {
                this.siegeResult = data.data;
                this.updateSiegeHUD(data.data);
            }
        } catch (e) {
            this.calcLocalSiege(ballistics, tData);
        }
    }

    async onOptimize() {
        const tData = this.scene.findTrebuchetDataById(this.currentTrebuchetId);
        const wall = this.wallTypes.find(w => w.id === this.currentWallId);
        if (!tData || !wall) return;

        try {
            const response = await fetch(
                `${API_BASE}/api/calc/optimize?projectile_mass=${tData.projectile_kg}` +
                `&wall_thickness=${wall.thickness_m}` +
                `&wall_density=${wall.density_kgm3}` +
                `&wall_compressive_strength=${wall.compressive_strength_pa}` +
                `&min_velocity=20&max_velocity=80` +
                `&min_angle=30&max_angle=60`
            );
            const data = await response.json();
            if (data.success && data.data) {
                this.applyOptimal(data.data);
            }
        } catch (e) {
            console.log('Optimize not available offline');
        }
    }

    applyOptimal(opt) {
        document.getElementById('angleSlider').value = opt.optimal_angle_deg.toFixed(1);
        document.getElementById('angleValue').textContent = opt.optimal_angle_deg.toFixed(1);
        document.getElementById('velocitySlider').value = opt.optimal_velocity_mps.toFixed(1);
        document.getElementById('velocityValue').textContent = opt.optimal_velocity_mps.toFixed(1);
        this.params.angle = opt.optimal_angle_deg;
        this.params.velocity = opt.optimal_velocity_mps;
        this.syncArmAngle();
    }

    classifyDamage(ratio) {
        if (ratio >= 0.9) return "完全摧毁";
        if (ratio >= 0.7) return "严重破坏";
        if (ratio >= 0.5) return "中等破坏";
        if (ratio >= 0.3) return "轻度破坏";
        if (ratio >= 0.1) return "表面损伤";
        return "无明显损伤";
    }

    showTrajectory(result, tData) {
        const trebuchet = this.scene.findTrebuchetById(this.currentTrebuchetId);
        if (!trebuchet || !result.trajectory) return;

        const startPos = trebuchet.group.position;

        const adjustedPoints = result.trajectory.map(p => ({
            x: startPos.x + p.x * Math.sin(trebuchet.rotation),
            y: startPos.y + p.y + 2,
            z: startPos.z - p.x * Math.cos(trebuchet.rotation),
        }));

        this.particles.createTrajectoryLine(adjustedPoints, { color: 0xffd700, speed: 0.8 });
        this.particles.createTrajectory(adjustedPoints, {
            color: 0xffa500,
            particleSize: 0.4,
            speed: 0.8,
        });
    }

    updateHUD(r) {
        document.getElementById('hudRange').textContent = r.range_m.toFixed(1) + ' m';
        document.getElementById('hudHeight').textContent = r.max_height_m.toFixed(1) + ' m';
        document.getElementById('hudTime').textContent = r.flight_time_s.toFixed(2) + ' s';
        document.getElementById('hudImpactVel').textContent = r.impact_velocity_mps.toFixed(1) + ' m/s';
        document.getElementById('hudEnergy').textContent = (r.impact_kinetic_energy_j / 1000).toFixed(1) + ' kJ';
    }

    updateSiegeHUD(r) {
        document.getElementById('hudCrater').textContent = r.crater_depth_m.toFixed(2) + ' m';
        document.getElementById('hudDamage').textContent = (r.damage_ratio * 100).toFixed(1) + ' %';
        document.getElementById('hudScore').textContent = r.effectiveness_score.toFixed(1);
        document.getElementById('damageFill').style.width = (r.damage_ratio * 100) + '%';
        document.getElementById('damageLabel').textContent = r.structural_damage || '--';
    }

    updateConnectionStatus(connected) {
        const badge = document.getElementById('connectionStatus');
        if (connected) {
            badge.classList.remove('disconnected');
            badge.querySelector('span:last-child').textContent = '已连接';
        } else {
            badge.classList.add('disconnected');
            badge.querySelector('span:last-child').textContent = '离线模式';
        }
    }

    onCanvasClick(event) {
        const rect = this.scene.getCanvasDomElement().getBoundingClientRect();
        const mouse = this.scene.getMouseVector();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = this.scene.getRaycaster();
        raycaster.setFromCamera(mouse, this.scene.camera);

        const meshes = this.scene.getRaycastTrebuchetMeshes();
        const intersects = raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            const id = this.scene.resolveTrebuchetFromIntersect(intersects[0].object);
            if (id !== null) {
                this.showTrebuchetInfo(id);
            }
        }
    }

    showTrebuchetInfo(id) {
        const t = this.trebuchetData ? this.trebuchetData.find(t => t.id === id)
            : this.scene.findTrebuchetDataById(id);
        if (!t) return;

        document.getElementById('popupTitle').textContent = t.name;

        let ballisticsInfo = '';
        let siegeInfo = '';

        if (this.ballisticsResult && this.currentTrebuchetId === id) {
            const r = this.ballisticsResult;
            ballisticsInfo = `
                <div class="popup-section">
                    <h4>弹道参数</h4>
                    <div class="detail-row"><span class="label">射程</span><span class="value">${r.range_m.toFixed(2)} m</span></div>
                    <div class="detail-row"><span class="label">最大高度</span><span class="value">${r.max_height_m.toFixed(2)} m</span></div>
                    <div class="detail-row"><span class="label">飞行时间</span><span class="value">${r.flight_time_s.toFixed(2)} s</span></div>
                    <div class="detail-row"><span class="label">着速</span><span class="value">${r.impact_velocity_mps.toFixed(2)} m/s</span></div>
                    <div class="detail-row"><span class="label">冲击动能</span><span class="value">${r.impact_kinetic_energy_j.toFixed(0)} J</span></div>
                </div>
            `;
        }

        if (this.siegeResult && this.currentTrebuchetId === id) {
            const s = this.siegeResult;
            siegeInfo = `
                <div class="popup-section">
                    <h4>攻城效能</h4>
                    <div class="detail-row"><span class="label">弹坑深度</span><span class="value">${s.crater_depth_m.toFixed(3)} m</span></div>
                    <div class="detail-row"><span class="label">弹坑直径</span><span class="value">${s.crater_diameter_m.toFixed(2)} m</span></div>
                    <div class="detail-row"><span class="label">损伤率</span><span class="value">${(s.damage_ratio * 100).toFixed(1)} %</span></div>
                    <div class="detail-row"><span class="label">效能评分</span><span class="value">${s.effectiveness_score.toFixed(1)}/100</span></div>
                    <div class="detail-row"><span class="label">破坏等级</span><span class="value">${s.structural_damage || '--'}</span></div>
                </div>
            `;
        }

        document.getElementById('popupBody').innerHTML = `
            <div class="popup-section">
                <h4>基本信息</h4>
                <div class="detail-row"><span class="label">类型</span><span class="value">${t.type_ || t.type}</span></div>
                <div class="detail-row"><span class="label">配重</span><span class="value">${t.counterweight_kg} kg</span></div>
                <div class="detail-row"><span class="label">弹丸质量</span><span class="value">${t.projectile_kg} kg</span></div>
                <div class="detail-row"><span class="label">臂长</span><span class="value">${t.arm_length_m} m</span></div>
                <div class="detail-row"><span class="label">最大发射角</span><span class="value">${t.max_angle_deg}°</span></div>
            </div>
            ${ballisticsInfo}
            ${siegeInfo}
        `;
        document.getElementById('infoPopup').classList.add('active');
    }
}

class SiegeSimulation {
    constructor() {
        this.scene = new SceneManager('canvasContainer');
        this.particleSystem = new TrajectoryParticles(this.scene.scene);
        this.panel = new BallisticPanelController(this.scene, this.particleSystem);
        this.animate();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.scene.render(this.particleSystem);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.sim = new SiegeSimulation();
});
