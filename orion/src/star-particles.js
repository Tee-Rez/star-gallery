// star-particles.js
const starParticlesComponent = {
  schema: {
    color: {type: 'string', default: '#ff4400'},
    count: {type: 'number', default: 50},
    size: {type: 'number', default: 0.05},
    speed: {type: 'number', default: 1},
  },

  init() {
    // Create particle group
    this.particles = []
    this.time = 0

    // Create particle geometry
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(this.data.count * 3)
    const colors = new Float32Array(this.data.count * 3)
    const sizes = new Float32Array(this.data.count)
    const color = new THREE.Color(this.data.color)

    // Initialize particles
    for (let i = 0; i < this.data.count; i++) {
      this.particles.push({
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02 * this.data.speed,
          (Math.random() - 0.5) * 0.02 * this.data.speed,
          (Math.random() - 0.5) * 0.02 * this.data.speed
        ),
        alpha: 1.0,
        size: this.data.size * (0.5 + Math.random() * 0.5),
        age: Math.random() * 2.0,
      })

      positions[i * 3] = 0
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = 0

      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b

      sizes[i] = this.data.size
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    // Create particle material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: {value: 0.0},
      },
      vertexShader: `
        attribute float size;
        varying float vAlpha;
        
        void main() {
          vAlpha = 1.0 - (position.y * 0.5 + 0.5);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
          gl_FragColor = vec4(1.0, 0.6, 0.2, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    // Create particle system
    this.particleSystem = new THREE.Points(geometry, material)
    this.el.object3D.add(this.particleSystem)

    // Bind tick function
    this.tick = AFRAME.utils.throttleTick(this.tick.bind(this), 16)
  },

  tick(time, deltaTime) {
    deltaTime = Math.min(deltaTime, 33)
    this.time += deltaTime * 0.001

    const positions = this.particleSystem.geometry.attributes.position.array
    const sizes = this.particleSystem.geometry.attributes.size.array

    // Update particles
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i]

      particle.age += deltaTime * 0.001
      if (particle.age > 2.0) {
        // Reset particle
        particle.age = 0
        particle.position.set(0, 0, 0)
        particle.velocity.set(
          (Math.random() - 0.5) * 0.02 * this.data.speed,
          (Math.random() - 0.5) * 0.02 * this.data.speed,
          (Math.random() - 0.5) * 0.02 * this.data.speed
        )
      }

      // Update position with some outward motion
      const outwardForce = particle.position.clone().normalize().multiplyScalar(0.0001 * this.data.speed)
      particle.velocity.add(outwardForce)
      particle.position.add(particle.velocity)

      particle.alpha = 1.0 - (particle.age / 2.0)

      positions[i * 3] = particle.position.x
      positions[i * 3 + 1] = particle.position.y
      positions[i * 3 + 2] = particle.position.z

      sizes[i] = particle.size * (1.0 - particle.age / 2.0)
    }

    this.particleSystem.geometry.attributes.position.needsUpdate = true
    this.particleSystem.geometry.attributes.size.needsUpdate = true
    this.particleSystem.material.uniforms.time.value = this.time
  },

  remove() {
    if (this.particleSystem) {
      this.el.object3D.remove(this.particleSystem)
      this.particleSystem.geometry.dispose()
      this.particleSystem.material.dispose()
    }
  },
}

export {starParticlesComponent}
