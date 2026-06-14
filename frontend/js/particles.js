class TrajectoryParticles {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.particleSystems = [];
        this.activeTrajectories = [];
    }

    createTrajectory(trajectoryPoints, options = {}) {
        const color = options.color || 0xffd700;
        const particleSize = options.particleSize || 0.3;
        const trail = options.trail !== false;

        const trajectory = {
            points: trajectoryPoints,
            currentIndex: 0,
            particles: [],
            trailParticles: [],
            progress: 0,
            speed: options.speed || 1,
            active: true,
            startTime: performance.now(),
            color: color,
            onComplete: options.onComplete || null,
        };

        const projectileGeo = new THREE.SphereGeometry(particleSize * 1.5, 12, 12);
        const projectileMat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5,
        });
        trajectory.projectile = new THREE.Mesh(projectileGeo, projectileMat);
        this.scene.add(trajectory.projectile);

        if (trajectoryPoints.length > 0) {
            trajectory.projectile.position.set(
                trajectoryPoints[0].x,
                trajectoryPoints[0].y,
                trajectoryPoints[0].z || 0
            );
        }

        const trailCount = 20;
        for (let i = 0; i < trailCount; i++) {
            const trailGeo = new THREE.SphereGeometry(particleSize * (1 - i / trailCount) * 0.8, 6, 6);
            const trailMat = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: (1 - i / trailCount) * 0.6,
            });
            const trailParticle = new THREE.Mesh(trailGeo, trailMat);
            trajectory.trailParticles.push(trailParticle);
            this.scene.add(trailParticle);
        }

        this.activeTrajectories.push(trajectory);
        return trajectory;
    }

    createGroundImpact(position, options = {}) {
        const color = options.color || 0x8B4513;
        const particleCount = options.count || 30;

        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const size = Math.random() * 0.3 + 0.1;
            const geo = new THREE.SphereGeometry(size, 6, 6);
            const mat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.9,
            });
            const particle = new THREE.Mesh(geo, mat);

            particle.position.copy(position);

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            const upward = Math.random() * 6 + 2;

            particle.userData = {
                velocity: new THREE.Vector3(
                    Math.cos(angle) * speed,
                    upward,
                    Math.sin(angle) * speed
                ),
                life: 1,
                decay: Math.random() * 0.02 + 0.01,
            };

            this.scene.add(particle);
            particles.push(particle);
        }

        this.particles.push(...particles);

        const ringGeo = new THREE.RingGeometry(0.5, 3, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
        });
        const impactRing = new THREE.Mesh(ringGeo, ringMat);
        impactRing.rotation.x = -Math.PI / 2;
        impactRing.position.copy(position);
        impactRing.position.y = 0.01;
        this.scene.add(impactRing);

        const ringExpansion = {
            mesh: impactRing,
            scale: 1,
            maxScale: 5,
            life: 1,
        };
        this.particles.push(ringExpansion);
    }

    createTrajectoryLine(trajectoryPoints, options = {}) {
        const color = options.color || 0xffd700;
        const opacity = options.opacity || 0.6;

        const points = trajectoryPoints.map(p =>
            new THREE.Vector3(p.x, p.y, p.z || 0)
        );

        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            linewidth: 2,
        });

        const line = new THREE.Line(geometry, material);
        this.scene.add(line);

        const dotsGeo = new THREE.BufferGeometry();
        const dotPositions = [];
        for (let i = 0; i < points.length; i += 3) {
            dotPositions.push(points[i].x, points[i].y, points[i].z);
        }
        dotsGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));

        const dotsMat = new THREE.PointsMaterial({
            color: color,
            size: 0.2,
            transparent: true,
            opacity: opacity * 0.8,
        });

        const dots = new THREE.Points(dotsGeo, dotsMat);
        this.scene.add(dots);

        return { line, dots };
    }

    update(deltaTime) {
        const dt = deltaTime || 0.016;

        for (let i = this.activeTrajectories.length - 1; i >= 0; i--) {
            const traj = this.activeTrajectories[i];
            if (!traj.active) continue;

            traj.progress += dt * traj.speed * 2;

            const totalPoints = traj.points.length;
            const index = Math.floor(traj.progress * (totalPoints - 1));

            if (index >= totalPoints - 1) {
                traj.active = false;

                const lastPoint = traj.points[totalPoints - 1];
                this.createGroundImpact(
                    new THREE.Vector3(lastPoint.x, 0.1, lastPoint.z || 0),
                    { color: 0x8B4513, count: 25 }
                );

                if (traj.onComplete) {
                    traj.onComplete();
                }

                continue;
            }

            const point = traj.points[index];
            traj.projectile.position.set(point.x, point.y, point.z || 0);

            for (let j = 0; j < traj.trailParticles.length; j++) {
                const trailIndex = Math.max(0, index - j * 2);
                const trailPoint = traj.points[trailIndex];
                traj.trailParticles[j].position.set(
                    trailPoint.x,
                    trailPoint.y,
                    trailPoint.z || 0
                );
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            if (p.scale !== undefined) {
                p.scale += dt * 8;
                p.life -= dt * 2;
                if (p.mesh) {
                    p.mesh.scale.setScalar(p.scale);
                    p.mesh.material.opacity = p.life * 0.8;
                }
                if (p.life <= 0) {
                    if (p.mesh) {
                        this.scene.remove(p.mesh);
                    }
                    this.particles.splice(i, 1);
                }
                continue;
            }

            if (!p.userData || !p.userData.velocity) continue;

            p.userData.velocity.y -= 9.81 * dt;

            p.position.x += p.userData.velocity.x * dt;
            p.position.y += p.userData.velocity.y * dt;
            p.position.z += p.userData.velocity.z * dt;

            if (p.position.y <= 0.05) {
                p.position.y = 0.05;
                p.userData.velocity.y *= -0.3;
                p.userData.velocity.x *= 0.7;
                p.userData.velocity.z *= 0.7;
            }

            p.userData.life -= p.userData.decay;

            if (p.userData.life <= 0 || p.position.y < 0) {
                this.scene.remove(p);
                this.particles.splice(i, 1);
            } else if (p.material && p.material.opacity !== undefined) {
                p.material.opacity = p.userData.life;
            }
        }
    }

    clearAll() {
        for (const traj of this.activeTrajectories) {
            if (traj.projectile) {
                this.scene.remove(traj.projectile);
            }
            for (const tp of traj.trailParticles) {
                this.scene.remove(tp);
            }
        }
        this.activeTrajectories = [];

        for (const p of this.particles) {
            if (p.mesh) {
                this.scene.remove(p.mesh);
            } else {
                this.scene.remove(p);
            }
        }
        this.particles = [];
    }
}
