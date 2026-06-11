import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const createTextTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 320
  const context = canvas.getContext('2d')

  if (!context) return { texture: null, canvas, context: null }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  return { texture, canvas, context }
}

export function ThreeWritingScene() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#181a1f')
    scene.fog = new THREE.FogExp2('#181a1f', 0.055)

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
    camera.position.set(7.4, 5.2, 9.6)
    camera.lookAt(0, 2.3, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const world = new THREE.Group()
    world.rotation.y = -0.18
    scene.add(world)

    const material = (color: string, roughness = 0.72, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness })

    const dark = material('#252832', 0.62)
    const deskMaterial = material('#5b4037', 0.58)
    const skin = material('#c98368', 0.82)
    const shirt = material('#6673db', 0.72)
    const hair = material('#27232b', 0.9)
    const trouser = material('#343744', 0.82)
    const laptop = material('#777d8f', 0.34, 0.55)
    const laptopEdge = material('#30343e', 0.38, 0.45)
    const accent = new THREE.MeshStandardMaterial({
      color: '#8993ff',
      emissive: '#5964df',
      emissiveIntensity: 1.7,
      roughness: 0.4,
    })

    const addMesh = (
      geometry: THREE.BufferGeometry,
      meshMaterial: THREE.Material,
      position: [number, number, number],
      parent: THREE.Object3D = world,
    ) => {
      const mesh = new THREE.Mesh(geometry, meshMaterial)
      mesh.position.set(...position)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    // The face details are placed on the character's local -Z side.
    // This returns the Y rotation needed to point that -Z side toward any target.
    const getFaceYaw = (from: THREE.Vector3, to: THREE.Vector3) => {
      const dx = to.x - from.x
      const dz = to.z - from.z
      return Math.atan2(-dx, -dz)
    }

    // Stage and furniture
    const floor = addMesh(new THREE.CircleGeometry(7.8, 64), material('#20232a', 0.92), [0, 0, 0])
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true

    addMesh(new THREE.BoxGeometry(6.3, 0.22, 2.7), deskMaterial, [0.25, 2.1, 0.15])
    for (const x of [-2.45, 2.95]) {
      for (const z of [-0.85, 1.12]) {
        addMesh(new THREE.CylinderGeometry(0.09, 0.11, 2.05, 14), dark, [x, 1.03, z])
      }
    }

    const chair = addMesh(new THREE.BoxGeometry(2, 0.22, 1.65), dark, [0.02, 1.02, 2.25])
    chair.rotation.y = -0.03
    const chairBack = addMesh(new THREE.BoxGeometry(1.9, 2.15, 0.18), dark, [0, 2.12, 3.02])
    chairBack.rotation.x = -0.08

    // Laptop base and screen
    const laptopBase = addMesh(new THREE.BoxGeometry(2.55, 0.12, 1.55), laptop, [0.82, 2.28, 0.06])
    laptopBase.rotation.y = -0.05
    const keyboard = addMesh(new THREE.BoxGeometry(1.82, 0.025, 0.78), laptopEdge, [0.75, 2.355, 0.07])
    keyboard.rotation.y = -0.05

    const screenGroup = new THREE.Group()
    screenGroup.position.set(0.82, 2.36, -0.65)
    screenGroup.rotation.y = -0.05
    screenGroup.rotation.x = -0.13
    world.add(screenGroup)
    addMesh(new THREE.BoxGeometry(2.6, 1.72, 0.11), laptop, [0, 0.8, 0], screenGroup)

    const textCanvas = createTextTexture()
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: textCanvas.texture,
      color: '#ffffff',
    })
    addMesh(new THREE.PlaneGeometry(2.28, 1.42), screenMaterial, [0, 0.8, 0.061], screenGroup)

    // Seated character
    const screenFocus = new THREE.Vector3(0.82, 3.15, -0.65)
    const character = new THREE.Group()
    character.position.set(-0.08, 0, 1.76)
    character.rotation.y = getFaceYaw(character.position, screenFocus)
    world.add(character)

    const torso = addMesh(new THREE.CapsuleGeometry(0.68, 1.25, 8, 20), shirt, [0, 2.65, 0], character)
    torso.rotation.x = 0.18
    const neck = addMesh(new THREE.CylinderGeometry(0.22, 0.25, 0.36, 18), skin, [0, 3.66, -0.18], character)
    neck.rotation.x = 0.12
    const head = addMesh(new THREE.SphereGeometry(0.57, 28, 24), skin, [0, 4.14, -0.32], character)
    head.scale.set(0.9, 1.05, 0.9)
    head.rotation.x = 0.13

    // Layered hair creates a crown, tapered back, side volume, and a soft fringe.
    const hairCrown = addMesh(new THREE.SphereGeometry(0.6, 28, 22), hair, [0, 4.4, -0.27], character)
    hairCrown.scale.set(0.96, 0.62, 0.96)
    const hairBack = addMesh(new THREE.SphereGeometry(0.5, 24, 18), hair, [0, 4.23, 0.02], character)
    hairBack.scale.set(0.92, 0.92, 0.55)
    for (const side of [-1, 1]) {
      const sideHair = addMesh(
        new THREE.SphereGeometry(0.25, 18, 16),
        hair,
        [side * 0.43, 4.25, -0.2],
        character,
      )
      sideHair.scale.set(0.55, 1.12, 0.72)
    }
    for (const x of [-0.28, -0.09, 0.1, 0.29]) {
      const fringe = addMesh(
        new THREE.ConeGeometry(0.15, 0.4, 12),
        hair,
        [x, 4.35 + Math.abs(x) * 0.12, -0.72],
        character,
      )
      fringe.rotation.x = -0.82
      fringe.rotation.z = x * 0.7
    }

    addMesh(new THREE.SphereGeometry(0.035, 12, 12), dark, [-0.2, 4.14, -0.81], character)
    addMesh(new THREE.SphereGeometry(0.035, 12, 12), dark, [0.2, 4.14, -0.81], character)

    const createArm = (side: number) => {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.62, 3.18, -0.12)
      shoulder.rotation.z = side * -0.34
      shoulder.rotation.x = 0.88
      character.add(shoulder)

      const upper = addMesh(new THREE.CapsuleGeometry(0.16, 0.66, 6, 14), shirt, [0, -0.44, 0], shoulder)
      upper.rotation.z = side * 0.08
      const elbow = new THREE.Group()
      elbow.position.set(side * 0.05, -0.88, -0.03)
      elbow.rotation.x = 0.96
      elbow.rotation.z = side * 0.28
      shoulder.add(elbow)
      addMesh(new THREE.CapsuleGeometry(0.13, 0.58, 6, 14), skin, [0, -0.39, 0], elbow)

      const wrist = new THREE.Group()
      wrist.position.set(0, -0.8, -0.02)
      wrist.rotation.x = -0.22
      wrist.rotation.z = side * -0.08
      elbow.add(wrist)

      const palm = addMesh(new THREE.SphereGeometry(0.17, 20, 16), skin, [0, -0.06, -0.1], wrist)
      palm.scale.set(1.05, 0.5, 1.3)

      const fingerOffsets = [-0.12, -0.04, 0.04, 0.12]
      fingerOffsets.forEach((x, index) => {
        const finger = addMesh(
          new THREE.CapsuleGeometry(0.025, 0.13 + (index === 1 || index === 2 ? 0.025 : 0), 4, 8),
          skin,
          [x, -0.08, -0.28],
          wrist,
        )
        finger.rotation.x = Math.PI / 2
        finger.rotation.z = side * (index - 1.5) * 0.025
      })

      const thumb = addMesh(
        new THREE.CapsuleGeometry(0.035, 0.13, 4, 8),
        skin,
        [side * 0.18, -0.08, -0.12],
        wrist,
      )
      thumb.rotation.x = Math.PI / 2
      thumb.rotation.z = side * -0.72
      return { shoulder, elbow }
    }

    const leftArm = createArm(-1)
    const rightArm = createArm(1)

    for (const side of [-1, 1]) {
      const thigh = addMesh(new THREE.CapsuleGeometry(0.25, 1.05, 6, 16), trouser, [side * 0.38, 1.4, 1.12], character)
      thigh.rotation.x = Math.PI / 2.3
      const shin = addMesh(new THREE.CapsuleGeometry(0.21, 1.05, 6, 16), trouser, [side * 0.4, 0.7, 0.45], character)
      shin.rotation.x = 0.07
      const shoe = addMesh(new THREE.CapsuleGeometry(0.22, 0.45, 5, 14), dark, [side * 0.4, 0.19, 0.12], character)
      shoe.rotation.x = Math.PI / 2
    }

    // Floating ideas and atmospheric particles
    const ideaGroup = new THREE.Group()
    world.add(ideaGroup)
    for (let index = 0; index < 9; index += 1) {
      const width = 0.45 + Math.random() * 0.72
      const line = addMesh(
        new THREE.BoxGeometry(width, 0.035, 0.018),
        index % 3 === 0 ? accent : material('#737a91', 0.45),
        [
          -2.8 + Math.random() * 5.8,
          3.2 + Math.random() * 2.7,
          -1.9 + Math.random() * 1.3,
        ],
        ideaGroup,
      )
      line.userData.speed = 0.25 + Math.random() * 0.45
      line.userData.offset = Math.random() * Math.PI * 2
    }

    const particleGeometry = new THREE.BufferGeometry()
    const particlePositions = new Float32Array(120 * 3)
    for (let index = 0; index < particlePositions.length; index += 3) {
      particlePositions[index] = (Math.random() - 0.5) * 14
      particlePositions[index + 1] = Math.random() * 8
      particlePositions[index + 2] = (Math.random() - 0.5) * 10
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: '#6973ca', size: 0.025, transparent: true, opacity: 0.5 }),
    )
    scene.add(particles)

    // Lighting
    scene.add(new THREE.HemisphereLight('#aeb6ff', '#17181d', 1.65))
    const keyLight = new THREE.DirectionalLight('#f5ddcc', 4.4)
    keyLight.position.set(4, 8, 6)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    keyLight.shadow.camera.near = 1
    keyLight.shadow.camera.far = 20
    scene.add(keyLight)
    const rimLight = new THREE.PointLight('#6573ff', 18, 12, 2)
    rimLight.position.set(-4, 4.8, -3)
    scene.add(rimLight)
    const screenLight = new THREE.PointLight('#8792ff', 5.5, 4.5, 2)
    screenLight.position.set(0.8, 3.2, -0.2)
    world.add(screenLight)

    const drawScreen = (progress: number) => {
      const context = textCanvas.context
      if (!context || !textCanvas.texture) return
      const safeProgress = Number.isFinite(progress) ? Math.max(0, progress) : 0
      context.fillStyle = '#151820'
      context.fillRect(0, 0, 512, 320)
      context.fillStyle = '#6772e5'
      context.fillRect(34, 28, 24, 24)
      context.fillStyle = '#e5e6ed'
      context.font = '600 18px Arial'
      context.fillText('SyncSpace', 70, 48)
      context.fillStyle = '#363b4a'
      context.fillRect(34, 73, 444, 1)

      const lines = [
        [34, 104, 300],
        [34, 139, 390],
        [34, 174, 350],
        [34, 209, 410],
        [34, 244, 260],
      ]
      lines.forEach(([x, y, width], index) => {
        const visibleWidth = Math.max(0, Math.min(width, safeProgress - index * 115))
        context.fillStyle = index === 0 ? '#f1f1f4' : '#8d91a1'
        context.fillRect(x, y, visibleWidth, index === 0 ? 11 : 7)
      })
      const cursorLine = Math.min(lines.length - 1, Math.floor(safeProgress / 115))
      const currentLine = lines[cursorLine] ?? lines[0]
      const cursorX = 34 + Math.max(0, Math.min(currentLine[2], safeProgress - cursorLine * 115))
      context.fillStyle = '#7d88ff'
      context.fillRect(cursorX + 3, currentLine[1] - 4, 2, 17)
      textCanvas.texture.needsUpdate = true
    }

    let frameId = 0
    let running = true
    let elapsed = 0
    let lastTime = performance.now()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    }

    const render = (now: number) => {
      if (!running) return
      const delta = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      elapsed += delta

      const motion = reducedMotion ? 0 : 1
      const typing = elapsed * 5.4
      leftArm.elbow.rotation.x = 0.96 + Math.sin(typing) * 0.055 * motion
      rightArm.elbow.rotation.x = 0.96 + Math.sin(typing + Math.PI) * 0.06 * motion
      leftArm.shoulder.rotation.z = 0.34 + Math.sin(typing * 0.52) * 0.02 * motion
      rightArm.shoulder.rotation.z = -0.34 + Math.cos(typing * 0.48) * 0.02 * motion
      head.rotation.z = Math.sin(elapsed * 0.65) * 0.025 * motion
      torso.position.y = 2.65 + Math.sin(elapsed * 1.15) * 0.018 * motion
      screenLight.intensity = 5.5 + Math.sin(elapsed * 1.8) * 0.45 * motion

      ideaGroup.children.forEach((child) => {
        child.position.y += Math.sin(elapsed * child.userData.speed + child.userData.offset) * 0.0008 * motion
        child.rotation.z = Math.sin(elapsed * 0.35 + child.userData.offset) * 0.08 * motion
      })
      particles.rotation.y = elapsed * 0.015 * motion

      const cameraDrift = Math.sin(elapsed * 0.18) * 0.28 * motion
      camera.position.x = 7.4 + cameraDrift
      camera.position.y = 5.2 + Math.cos(elapsed * 0.16) * 0.1 * motion
      camera.lookAt(0, 2.35, 0.35)

      const typingProgress = (elapsed * 90) % 575
      drawScreen(typingProgress)
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(render)
    }

    const handleVisibility = () => {
      running = !document.hidden
      if (running) {
        lastTime = performance.now()
        frameId = requestAnimationFrame(render)
      } else {
        cancelAnimationFrame(frameId)
      }
    }

    resize()
    drawScreen(0)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', handleVisibility)
    frameId = requestAnimationFrame(render)

    return () => {
      running = false
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((item) => item.dispose())
        }
      })
      particleGeometry.dispose()
      textCanvas.texture?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div className="three-writing-scene" ref={mountRef}>
      <div className="three-scene-label">
        <span>Live ideas</span>
        <strong>Make space for your best work.</strong>
      </div>
    </div>
  )
}
