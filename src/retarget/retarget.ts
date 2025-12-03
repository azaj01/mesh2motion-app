import { Mesh2MotionEngine } from '../Mesh2MotionEngine.ts'
import { Vector3 } from 'three'

class RetargetModule {
  private mesh2motion_engine: Mesh2MotionEngine
  private fileInput: HTMLInputElement | null = null

  constructor () {
    // Set up camera position similar to marketing bootstrap
    this.mesh2motion_engine = new Mesh2MotionEngine()
    const camera_position = new Vector3().set(0, 1.7, 5)
    this.mesh2motion_engine.set_camera_position(camera_position)
  }

  public add_event_listeners (): void {
    // Get DOM elements
    this.fileInput = document.getElementById('upload-file') as HTMLInputElement

    // Add event listener for file selection
    this.fileInput.addEventListener('change', (event) => {
      console.log('File input changed', event)
      this.handleFileSelect(event)
    })
  }

  private handleFileSelect (event: Event): void {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      const file = target.files[0]
      console.log('File selected:', file.name, 'Size:', file.size, 'Type:', file.type)
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  retarget_app.add_event_listeners()
})

const retarget_app = new RetargetModule()
