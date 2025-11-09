import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3, type KeyframeTrack } from "three"
import { TransformedAnimationClipPair } from "./interfaces/TransformedAnimationClipPair"

export class AnimationUtility {
  // when we scaled the skeleton itself near the beginning, we kept track of that
  // this scaling will affect position keyframes since they expect the original skeleton scale
  // this will fix any issues with position keyframes not matching the current skeleton scale
  static apply_skeleton_scale_to_position_keyframes (animation_clips: AnimationClip[], scaleAmount: number): void {
    animation_clips.forEach((animation_clip: AnimationClip) => {
      animation_clip.tracks.forEach((track: KeyframeTrack) => {
        if (track.name.includes('.position')) {
          const values = track.values
          for (let i = 0; i < values.length; i += 3) {
            values[i] *= scaleAmount
            values[i + 1] *= scaleAmount
            values[i + 2] *= scaleAmount
          }
        }
      })
    })
  }

  static deep_clone_animation_clip (clip: AnimationClip): AnimationClip {
    const tracks = clip.tracks.map((track: KeyframeTrack) => track.clone())
    return new AnimationClip(clip.name, clip.duration, tracks)
  }

  static deep_clone_animation_clips (animation_clips: AnimationClip[]): AnimationClip[] {
    return animation_clips.map((clip: AnimationClip) => {
      return this.deep_clone_animation_clip(clip)
    })
  }

  /// Removes position tracks from animation clips, keeping only rotation tracks.
  /// @param animation_clips - The animation clips to modify.
  /// @param preserve_root_position - Whether to keep the root position track.
  static clean_track_data (animation_clips: AnimationClip[], preserve_root_position: boolean = false): void {
    animation_clips.forEach((animation_clip: AnimationClip) => {
      // remove all position nodes except root
      let rotation_tracks: KeyframeTrack[] = []

      if (preserve_root_position) {
        rotation_tracks = animation_clip.tracks
          .filter((x: KeyframeTrack) => x.name.includes('quaternion') || x.name.toLowerCase().includes('hips.position'))
      } else {
        rotation_tracks = animation_clip.tracks
          .filter((x: KeyframeTrack) => x.name.includes('quaternion') || x.name.includes('hips.position'))
      }

      animation_clip.tracks = rotation_tracks // update track data
      // console.log(animation_clip.tracks) // UNUSED DEBUG CODE
    })
  }

  static apply_arm_extension_warp (animation_clips: TransformedAnimationClipPair[], percentage: number): void {
    // loop through each animation clip to update the tracks
    animation_clips.forEach((warped_clip: TransformedAnimationClipPair) => {
      warped_clip.display_animation_clip.tracks.forEach((track: KeyframeTrack) => {
        // if our name does not contain 'quaternion', we need to exit
        // since we are only modifying the quaternion tracks (e.g. L_Arm.quaternion )
        if (!track.name.includes('quaternion')) {
          return
        }

        const quaterion_track: QuaternionKeyframeTrack = track

        // if the track is an upper arm bone, then modify that
        const is_right_arm_track_match: boolean = quaterion_track.name.includes('upper_armR')
        const is_left_arm_track_match: boolean = quaterion_track.name.includes('upper_armL')

        if (is_right_arm_track_match || is_left_arm_track_match) {
          const new_track_values: Float32Array = quaterion_track.values.slice() // clone array

          const track_count: number = quaterion_track.times.length
          for (let i = 0; i < track_count; i++) {
            // get correct value since it is a quaternion
            const units_in_quaternions: number = 4
            const quaternion: Quaternion = new Quaternion()

            // rotate the upper arms in opposite directions to rise/lower arms
            if (is_right_arm_track_match) {
              quaternion.setFromAxisAngle(new Vector3(0, 0, -1), percentage / 100)
            }
            if (is_left_arm_track_match) {
              quaternion.setFromAxisAngle(new Vector3(0, 0, 1), percentage / 100)
            }

            // get the existing quaternion
            const existing_quaternion: Quaternion = new Quaternion(
              new_track_values[i * units_in_quaternions + 0],
              new_track_values[i * units_in_quaternions + 1],
              new_track_values[i * units_in_quaternions + 2],
              new_track_values[i * units_in_quaternions + 3]
            )

            // multiply the existing quaternion by the new quaternion
            existing_quaternion.multiply(quaternion)

            // this should change the first quaternion component of the track
            new_track_values[i * units_in_quaternions + 0] = existing_quaternion.x
            new_track_values[i * units_in_quaternions + 1] = existing_quaternion.y
            new_track_values[i * units_in_quaternions + 2] = existing_quaternion.z
            new_track_values[i * units_in_quaternions + 3] = existing_quaternion.w
          }

          track.values = new_track_values
        }
      })
    })
  }
}
