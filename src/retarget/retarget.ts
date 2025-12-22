import { Mesh2MotionEngine } from '../Mesh2MotionEngine.ts'
import { type Group, type Object3DEventMap, Vector3 } from 'three'
import { StepLoadSourceSkeleton } from './steps/StepLoadSourceSkeleton.ts'
import { StepLoadTargetModel } from './steps/StepLoadTargetModel.ts'
import { StepBoneMapping } from './steps/StepBoneMapping.ts'
import { RetargetAnimationPreview } from './RetargetAnimationPreview.ts'
import { RetargetAnimationListing } from './RetargetAnimationListing.ts'

class RetargetModule {
  private readonly mesh2motion_engine: Mesh2MotionEngine
  private readonly step_load_source_skeleton: StepLoadSourceSkeleton
  private readonly step_load_target_model: StepLoadTargetModel
  private readonly step_bone_mapping: StepBoneMapping
  private readonly retarget_animation_preview: RetargetAnimationPreview
  private animation_listing_step: RetargetAnimationListing | null = null

  private continue_button: HTMLButtonElement | null
  private back_to_bone_map_button: HTMLButtonElement | null = null

  constructor () {
    // Set up camera position similar to marketing bootstrap
    this.mesh2motion_engine = new Mesh2MotionEngine()
    const camera_position = new Vector3().set(0, 1.7, 5)
    this.mesh2motion_engine.set_camera_position(camera_position)

    // Override zoom limits for retargeting to accommodate models of various sizes
    // Allow closer zoom for small details and farther zoom for large models
    // FBX are known to have units with 1 = 1 cm, so things like mixamo will import at 200 units
    // GLB seems to have gone with 1 = 1 meter
    this.mesh2motion_engine.set_zoom_limits(0.1, 1000)

    // Initialize Mesh2Motion skeleton loading step (source)
    this.step_load_source_skeleton = new StepLoadSourceSkeleton(this.mesh2motion_engine.get_scene())

    // Initialize target model loading step
    this.step_load_target_model = new StepLoadTargetModel(this.mesh2motion_engine)

    // Initialize bone mapping step
    this.step_bone_mapping = new StepBoneMapping(this.mesh2motion_engine.get_scene())

    // Initialize animation preview
    this.retarget_animation_preview = new RetargetAnimationPreview(
      this.mesh2motion_engine.get_scene(),
      this.step_bone_mapping
    )

    // Set up animation loop for preview updates
    this.setup_animation_loop()
  }

  public init (): void {
    this.add_event_listeners()
    this.step_load_source_skeleton.begin()
    this.step_load_target_model.begin()
    this.step_bone_mapping.begin()
    this.retarget_animation_preview.begin()
  }

  public add_event_listeners (): void {
    // create button references
    this.back_to_bone_map_button = document.getElementById('back_to_bone_map_button') as HTMLButtonElement
    const bone_mapping_step = document.getElementById('bone-mapping-step')
    const animation_export_options = document.getElementById('skinned-step-animation-export-options')

    this.back_to_bone_map_button.onclick = () => {
      // Hide the skinned-step-animation-export-options ID and show the bone-mapping-step ID
      if (bone_mapping_step !== null && animation_export_options !== null) {
        animation_export_options.style.display = 'none'
        bone_mapping_step.style.display = 'inline'
      }
    }

    // Listen for source skeleton (Mesh2Motion) loaded
    this.step_load_source_skeleton.addEventListener('skeleton-loaded', () => {
      const source_armature = this.step_load_source_skeleton.get_loaded_source_armature()
      const skeleton_type = this.step_load_source_skeleton.get_skeleton_type()
      this.step_bone_mapping.set_source_skeleton_data(source_armature, skeleton_type)
      this.try_start_preview()
    })

    // Listen for target model (user-uploaded) loaded
    this.step_load_target_model.addEventListener('target-model-loaded', (event: Event) => {
      const custom_event = event as CustomEvent
      const retargetable_meshes = custom_event.detail.retargetable_meshes as Group<Object3DEventMap>

      // Set target skeleton data in bone mapping (uploaded mesh)
      this.step_bone_mapping.set_target_skeleton_data(retargetable_meshes)
      this.try_start_preview()

      // Show "Continue" button to proceed to animation listing
      this.continue_button = document.getElementById('continue-to-listing-button') as HTMLButtonElement
      this.continue_button.style.display = 'block'

      // move this continue onclick to the normal add event listener area to prevent multiple bindings
      this.continue_button.onclick = () => {
        // Hide the bone-mapping-step ID and show the skinned-step-animation-export-options ID
        if (bone_mapping_step !== null && animation_export_options !== null) {
          bone_mapping_step.style.display = 'none'
          animation_export_options.style.display = 'inline'
        }

        // load the animation listing step
        this.animation_listing_step = new RetargetAnimationListing(this.mesh2motion_engine.get_theme_manager())
        this.animation_listing_step.begin(this.step_load_source_skeleton.get_skeleton_type())
        this.animation_listing_step.load_and_apply_default_animation_to_skinned_mesh(retargetable_meshes)
      }
    })
  }

  private try_start_preview (): void {
    // Start preview when both skeletons are loaded
    if (this.step_bone_mapping.has_both_skeletons()) {
      console.log('Both skeletons loaded, starting animation preview...')
      this.retarget_animation_preview.start_preview().catch((error) => {
        console.error('Failed to start preview:', error)
      })
    }
  }

  private setup_animation_loop (): void {
    let last_time = performance.now()

    const animate = (): void => {
      requestAnimationFrame(animate)

      const current_time = performance.now()
      const delta_time = (current_time - last_time) / 1000 // Convert to seconds
      last_time = current_time

      // Update animation preview
      this.retarget_animation_preview.update(delta_time)
    }

    animate()
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  retarget_app.init()
})

const retarget_app = new RetargetModule()
