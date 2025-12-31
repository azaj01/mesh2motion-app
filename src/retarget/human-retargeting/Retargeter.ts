import * as THREE from 'three'
import { type Rig } from './Rig'
import { type Pose } from './Pose'
import { type ChainTwistAdditive } from './ChainTwistAdditive'
import Vec3 from './Vec3'
import Quat from './Quat'
import Transform from './Transform'

// example and library functions taken from sketchpunklabs
// https://github.com/sketchpunklabs/threejs_proto/blob/main/code/webgl/anim/002_retarget_4m2m.html

export class Retargeter {
  clip: THREE.AnimationClip | null = null
  mixer: THREE.AnimationMixer
  action: THREE.AnimationAction | null = null
  srcRig: Rig | null = null
  tarRig: Rig | null = null
  pose: Pose | null = null
  additives: ChainTwistAdditive[] = []

  // #region MAIN
  constructor () {
    this.mixer = new THREE.AnimationMixer(new THREE.Object3D())
  }
  // #endregion

  // #region SETTERS
  setSourceRig (rig: any) { this.srcRig = rig; return this }
  setTargetRig (rig: any) { this.tarRig = rig; return this }
  setClip (clip) {
    this.clip = clip

    if (this.action !== null) {
      this.action.stop() // TODO - Find how to clear out memory instead of just stopping it
      this.action = null
    }

    return this
  }
  // #endregion

  // #region METHODS
  update (delta_time: number): void {
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // PREPARE
    if (this.action === null) {
      this.action = this.mixer.clipAction(this.clip, this.srcRig.skel.bones[0])
      this.action.play()
    }

    if (this.pose == null) this.pose = this.tarRig.tpose.clone()

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Run Animation
    this.mixer.update(delta_time)

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Compute vectors from animation source
    // then align target joints to it
    this.applyScaledTranslation('pelvis')
    this.applyChain('pelvis')
    this.applyEndInterp('spine')
    this.applyChain('head')

    this.applyChain('armL')
    this.applyChain('armR')
    this.applyChain('legL')
    this.applyChain('legR')

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Run Addtives
    for (const i of this.additives) {
      i.apply(this)
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Apply working pose to 3JS skeleton for rendering
    this.pose.toSkeleton(this.tarRig.skel)
  }

  // Apply SwingTwist to each joint of a chain, 1 to 1 mappings
  applyChain (k) {
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    const src = this.srcRig.chains[k]
    const tar = this.tarRig.chains[k]
    if (!src || !tar) return

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    const cnt = src.length
    const v = new THREE.Vector3()
    const q = new THREE.Quaternion()

    const p = new Vec3()
    const sPos = new Vec3()
    const sRot = new Quat()
    const tRot = new Quat()
    const rot = new Quat()

    const sSwing = new Vec3() // Source Swing
    const sTwist = new Vec3() // Source Twist
    const nSwing = new Vec3()
    const nTwist = new Vec3()

    const ptran = new Transform()
    const ctran = new Transform()

    let b
    let j

    for (let i = 0; i < src.length; i++) {
      // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      // Get source swing / twist vectors
      // Pose exists in 3JS skeleton, so need to get its
      // Data threw 3JS methods
      b = this.srcRig.skel.bones[src[i].idx]
      b.getWorldPosition(v)
      b.getWorldQuaternion(q)
      sPos.copyObj(v)
      sRot.copyObj(q)

      sSwing.fromQuat(sRot, src[i].swing)
      sTwist.fromQuat(sRot, src[i].twist)

      // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      // Get Target Neutral Transform for the joint
      // ( neutralTwistDir x targetTwistDir ) * ( neutralSwingDir x targetSwingDir ) * neutralRot
      j = this.tarRig.tpose.joints[tar[i].idx]

      // neutral = currentPose.joint.world * tpose.joint.local
      this.pose.getWorld(j.pindex, ptran) // Current transform of parent joint
      ctran.fromMul(ptran, j.local) // Applied to TPose transform

      // ----------------------------
      // SWING
      nSwing.fromQuat(ctran.rot, tar[i].swing) // Get swing direction
      rot.fromSwing(nSwing, sSwing) // Rotation to match swing directions
        .mul(ctran.rot) // Apply to neutral rotation

      nSwing.fromQuat(rot, tar[i].swing) // For Debugging

      // ----------------------------
      // TWIST
      nTwist.fromQuat(rot, tar[i].twist) // Get twist from swing rotation
      tRot.fromSwing(nTwist, sTwist) // Rotation to match twist vectors
      rot.pmul(tRot) // Apply to swing rotation

      nTwist.fromQuat(rot, tar[i].twist) // For Debugging

      // ----------------------------
      rot.pmulInvert(ptran.rot) // To LocalSpace
      this.pose.setRot(tar[i].idx, rot) // Save to working pose

      // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      // Visualize computed target vectors from source animation
      Debug.pnt.add(sPos, 0xffff00, 1)
      Debug.ln.add(sPos, p.fromScaleThenAdd(0.1, sSwing, sPos), 0xffff00)
      Debug.ln.add(sPos, p.fromScaleThenAdd(0.1, sTwist, sPos), 0xff00ff)

      // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      // Visualize target vectors over mesh
      Debug.pnt.add(ctran.pos, 0x00ff00, 1)
      Debug.ln.add(ctran.pos, p.fromScaleThenAdd(0.15, nSwing, ctran.pos), 0xffff00)
      Debug.ln.add(ctran.pos, p.fromScaleThenAdd(0.1, nSwing, ctran.pos), 0xffffff)
      Debug.ln.add(ctran.pos, p.fromScaleThenAdd(0.15, nTwist, ctran.pos), 0xff00ff)
      Debug.ln.add(ctran.pos, p.fromScaleThenAdd(0.1, nTwist, ctran.pos), 0xff0000)
    }
  }

  // Interp start & end SwingTwist vectors over a chain
  applyEndInterp (k) {
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    const src = this.srcRig.chains[k]
    const tar = this.tarRig.chains[k]
    if (!src || !tar) return

    const dTran = new Transform() // Debug
    const vv = new Vec3() // Debug

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    const aTran = getWorld(this.srcRig.skel, src[0].idx)
    const aSwing = new Vec3().fromQuat(aTran.rot, src[0].swing)
    const aTwist = new Vec3().fromQuat(aTran.rot, src[0].twist)

    const bTran = getWorld(this.srcRig.skel, src.at(-1).idx)
    const bSwing = new Vec3().fromQuat(bTran.rot, src.at(-1).swing)
    const bTwist = new Vec3().fromQuat(bTran.rot, src.at(-1).twist)

    // Visualize data over source skeleton
    Debug.pnt.add(aTran.pos, 0xffff00, 1.2)
    Debug.pnt.add(bTran.pos, 0xffff00, 1.2)

    Debug.ln.add(aTran.pos, vv.fromScaleThenAdd(0.1, aSwing, aTran.pos), 0xffff00)
    Debug.ln.add(aTran.pos, vv.fromScaleThenAdd(0.1, aTwist, aTran.pos), 0xff00ff)
    Debug.ln.add(bTran.pos, vv.fromScaleThenAdd(0.1, bSwing, bTran.pos), 0xffff00)
    Debug.ln.add(bTran.pos, vv.fromScaleThenAdd(0.1, bTwist, bTran.pos), 0xff00ff)

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    const tDir = new Vec3()
    const dir = new Vec3()
    const iMax = tar.length - 1
    let itm, t, j

    for (let i = 0; i <= iMax; i++) {
      t = i / iMax
      itm = tar[i]

      // Lerp Target Vectors
      tDir.fromLerp(aSwing, bSwing, t).norm()
      dir.fromLerp(aTwist, bTwist, t).norm()

      // Make joint vectors match target vectors
      const rot = applySwingTwist(itm, tDir, dir, this.tarRig.tpose, this.pose)
      this.pose.setRot(itm.idx, rot)

      // -----------------------
      this.pose.getWorld(itm.idx, dTran)
      Debug.pnt.add(dTran.pos, 0x00ff00, 1, 1)
      Debug.ln.add(dTran.pos, vv.fromQuat(dTran.rot, itm.swing).scale(0.1).add(dTran.pos), 0xffff00)
      Debug.ln.add(dTran.pos, vv.fromQuat(dTran.rot, itm.twist).scale(0.1).add(dTran.pos), 0xff00ff)
    }
  }

  // Compute offset translation & scale it to fit better on target
  applyScaledTranslation (k) {
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Make sure we have our src & target
    const src = this.srcRig.chains[k][0]
    const tar = this.tarRig.chains[k][0]
    if (!src || !tar) return

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Compute offset position change from animation
    const scl = this.tarRig.scalar / this.srcRig.scalar // Scale from Src to Tar
    const tJoint = this.srcRig.tpose.joints[src.idx] // TPose Src Joint
    const srcTran = getWorld(this.srcRig.skel, src.idx) // WS Tranform of Src Bone

    // ( animated.joint.world.pos - tpose.joint.world.pos ) * ( tarHipHeight / srcHipHeight )
    const offset = new Vec3()
      .fromSub(srcTran.pos, tJoint.world.pos)
      .scale(scl)

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Neutral Transform
    const ptran = this.pose.getWorld(tar.pidx)
    const ctran = new Transform().fromMul(ptran, this.tarRig.tpose.joints[tar.idx].local)

    // Add scaled offset translation
    const pos = new Vec3().fromAdd(ctran.pos, offset)

    // Save to local space
    this.pose.setPos(tar.idx, ptran.toLocalPos(pos))
  }
  // #endregion
}
