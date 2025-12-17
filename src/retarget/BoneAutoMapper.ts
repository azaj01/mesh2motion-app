import { Bone, Group, Object3D, Scene, SkinnedMesh } from 'three'
import { BoneCategoryMapper } from './BoneCategoryMapper'
import { MixamoMapper } from './MixamoMapper'
import { TargetBoneMappingType } from './StepBoneMapping'

/**
 * Bone categories for grouping bones by anatomical area
 */
export enum BoneCategory {
  Torso = 'torso',
  Arms = 'arms',
  Hands = 'hands',
  Legs = 'legs',
  Wings = 'wings',
  Tail = 'tail',
  Unknown = 'unknown'
}

/**
 * Side of the body a bone belongs to
 */
export enum BoneSide {
  Left = 'left',
  Right = 'right',
  Center = 'center',
  Unknown = 'unknown'
}

/**
 * Metadata extracted from a bone name
 */
export interface BoneMetadata {
  name: string // Original bone name
  normalized_name: string // Normalized version for matching
  side: BoneSide // Which side of the body
  category: BoneCategory // Anatomical category
  parent_name: string | null // Name of parent bone, null if root
}

/**
 * BoneAutoMapper - Handles automatic bone mapping between source and target skeletons
 * Source = Mesh2Motion skeleton (draggable bones)
 * Target = Uploaded mesh skeleton (drop zones)
 * Uses string comparison and pattern matching to suggest bone mappings
 */
export class BoneAutoMapper {
  /**
   * Attempts to automatically map source bones (Mesh2Motion) to target bones (uploaded mesh)
   * @param source_armature - Source skeleton armature (Mesh2Motion skeleton)
   * @param target_skeleton_data - Target skeleton data (uploaded mesh)
   * @returns Map of target bone name -> source bone name
   */
  public static auto_map_bones (
    source_armature: Group,
    target_skeleton_data: Scene,
    target_bone_mapping_type: TargetBoneMappingType
  ): Map<string, string> {
    // mappings: final output mapping of target bone name to source bone name
    let mappings = new Map<string, string>()

    // Extract bone data from both skeletons
    // this also contains the parent bone relationship
    // which will help us later when doing auto-mapping calculations
    const source_parent_map: Map<string, string | null> = this.extract_source_bone_parent_map(source_armature)
    const target_parent_map: Map<string, string | null> = this.extract_target_bone_parent_map(target_skeleton_data)

    // Create metadata for both source and target bones
    const source_bones_meta: BoneMetadata[] = this.create_all_bone_metadata(source_parent_map)
    const target_bones_meta: BoneMetadata[] = this.create_all_bone_metadata(target_parent_map)

    console.log('\n=== FINAL BONE METADATA ===')
    console.log('Source bones metadata:', source_bones_meta)
    console.log('Target bones metadata:', target_bones_meta)

    // if the target is a mixamo rig and our skeleton type is human, we can do a direct name mapping
    // without worrying about guessing
    if (target_bone_mapping_type === TargetBoneMappingType.Mixamo) {
      console.log('Target skeleton appears to be a Mixamo rig, performing direct name mapping...')
      mappings = MixamoMapper.map_mixamo_bones(source_bones_meta, target_bones_meta)
      return mappings
    }

    // Match bones within each category
    const categories: BoneCategory[] = [
      BoneCategory.Torso,
      BoneCategory.Arms,
      BoneCategory.Hands,
      BoneCategory.Legs,
      BoneCategory.Wings,
      BoneCategory.Tail,
      BoneCategory.Unknown
    ]
    for (const category of categories) {
      const source_bones_in_category: BoneMetadata[] = source_bones_meta.filter(b => b.category === category)
      const target_bones_in_category: BoneMetadata[] = target_bones_meta.filter(b => b.category === category)

      switch (category) {
        case BoneCategory.Torso: {
          const torso_mappings = BoneCategoryMapper.map_torso_bones(source_bones_in_category, target_bones_in_category)
          mappings = new Map([...mappings, ...torso_mappings])
          break
        }
        case BoneCategory.Arms: {
          const arm_mappings = BoneCategoryMapper.map_arm_bones(source_bones_in_category, target_bones_in_category)
          mappings = new Map([...mappings, ...arm_mappings])
          break
        }
        case BoneCategory.Hands: {
          const hand_mappings = BoneCategoryMapper.map_hand_bones(source_bones_in_category, target_bones_in_category)
          mappings = new Map([...mappings, ...hand_mappings])
          break
        }
        case BoneCategory.Legs: {
          const leg_mappings = BoneCategoryMapper.map_leg_bones(source_bones_in_category, target_bones_in_category)
          mappings = new Map([...mappings, ...leg_mappings])
          break
        }
        case BoneCategory.Wings: {
          const wing_mappings = BoneCategoryMapper.map_wing_bones(source_bones_in_category, target_bones_in_category)
          mappings = new Map([...mappings, ...wing_mappings])
          break
        }
        case BoneCategory.Tail: {
          const tail_mappings = BoneCategoryMapper.map_tail_bones(source_bones_in_category, target_bones_in_category)
          mappings = new Map([...mappings, ...tail_mappings])
          break
        }
        case BoneCategory.Unknown: {
          const unknown_mappings = BoneCategoryMapper.map_unknown_bones(source_bones_in_category, target_bones_in_category)
          mappings = new Map([...mappings, ...unknown_mappings])
          break
        }
      }
    }

    return mappings
  }

  /**
   * Extract bone parent relationships from source skeleton (Mesh2Motion armature)
   * @param source_armature - Source skeleton armature
   * @returns Map of bone name to parent bone name
   */
  private static extract_source_bone_parent_map (source_armature: Group): Map<string, string | null> {
    const parent_map = new Map<string, string | null>()

    source_armature.traverse((child) => {
      if (child.type === 'Bone') {
        const parent_bone = child.parent
        if (parent_bone !== null && parent_bone.type === 'Bone') {
          parent_map.set(child.name, parent_bone.name)
        } else {
          parent_map.set(child.name, null) // Root bone
        }
      }
    })

    return parent_map
  }

  /**
   * Extract bone parent relationships from target skeleton (uploaded mesh)
   * @param target_skeleton_data - Target skeleton data group
   * @returns Map of bone name to parent bone name
   */
  private static extract_target_bone_parent_map (target_skeleton_data: Scene): Map<string, string | null> {
    const parent_map = new Map<string, string | null>()
    const processed_bones = new Set<string>()

    target_skeleton_data.traverse((child) => {
      if (child.type === 'SkinnedMesh') {
        const skinned_mesh = child as SkinnedMesh
        const skeleton = skinned_mesh.skeleton
        skeleton.bones.forEach((bone) => {
          // Skip if we've already processed this bone
          if (processed_bones.has(bone.name)) {
            return
          }
          processed_bones.add(bone.name)

          const parent_bone = bone.parent
          if (parent_bone !== null && parent_bone.type === 'Bone') {
            parent_map.set(bone.name, parent_bone.name)
          } else {
            parent_map.set(bone.name, null) // Root bone
          }
        })
      }
    })

    return parent_map
  }

  /**
   * Create metadata for all bones from parent map
   * @param parent_map - Map of bone name to parent bone name (null for root bones)
   * @returns Array of bone metadata objects
   */
  private static create_all_bone_metadata (parent_map: Map<string, string | null>): BoneMetadata[] {
    const bones_metadata: BoneMetadata[] = []

    for (const [bone_name, parent_name] of parent_map) {
      const metadata = this.create_bone_metadata(bone_name, parent_name)
      bones_metadata.push(metadata)
    }

    return bones_metadata
  }

  /**
   * Categorize a single bone based on keywords in its name
   * @param bone_name - Bone name to categorize
   * @returns The category this bone belongs to
   */
  private static categorize_bone (bone_name: string): BoneCategory {
    const normalized = bone_name.toLowerCase()

    // Torso keywords
    const torso_keywords = ['spine', 'chest', 'neck', 'head', 'hips', 'pelvis', 'root', 'cog', 'center', 'torso', 'back', 'ribcage']
    if (torso_keywords.some(keyword => normalized.includes(keyword))) {
      return BoneCategory.Torso
    }

    // Arm keywords
    const arm_keywords = ['shoulder', 'arm', 'elbow', 'wrist', 'clavicle', 'scapula', 'upperarm', 'forearm']
    if (arm_keywords.some(keyword => normalized.includes(keyword))) {
      return BoneCategory.Arms
    }

    // Hand keywords
    const hand_keywords = ['hand', 'finger', 'thumb', 'index', 'middle', 'ring', 'pinky', 'palm', 'knuckle', 'metacarpal', 'phalanx']
    if (hand_keywords.some(keyword => normalized.includes(keyword))) {
      return BoneCategory.Hands
    }

    // Leg keywords
    const leg_keywords = ['leg', 'thigh', 'knee', 'ankle', 'foot', 'toe', 'heel', 'hip', 'upperleg', 'lowerleg', 'shin', 'calf']
    if (leg_keywords.some(keyword => normalized.includes(keyword))) {
      return BoneCategory.Legs
    }

    // Wing keywords
    const wing_keywords = ['wing', 'feather', 'pinion']
    if (wing_keywords.some(keyword => normalized.includes(keyword))) {
      return BoneCategory.Wings
    }

    // Tail keywords
    const tail_keywords = ['tail']
    if (tail_keywords.some(keyword => normalized.includes(keyword))) {
      return BoneCategory.Tail
    }

    // If no category matched, return unknown
    return BoneCategory.Unknown
  }

  /**
   * Create metadata for a bone including category, side, and normalized name
   * @param bone_name - Original bone name
   * @param parent_name - Name of the parent bone (null if root)
   * @returns BoneMetadata object
   */
  private static create_bone_metadata (bone_name: string, parent_name: string | null): BoneMetadata {
    const bone_metadata: BoneMetadata = {
      name: bone_name,
      normalized_name: 'Unknown',
      side: BoneSide.Unknown,
      category: BoneCategory.Unknown,
      parent_name: parent_name
    }

    bone_metadata.category = this.categorize_bone(bone_name)
    bone_metadata.side = this.determine_bone_side(bone_name, bone_metadata.category)
    bone_metadata.normalized_name = this.normalize_bone_name(bone_name, bone_metadata.category, bone_metadata.side) // will help with matching

    return bone_metadata
  }

  /**
   * Determine which side of the body a bone belongs to
   * @param bone_name - Bone name to analyze
   * @param category - The bone's category (used to determine if it should be center)
   * @returns The side this bone belongs to
   */
  private static determine_bone_side (bone_name: string, category: BoneCategory): BoneSide {
    const normalized = bone_name.toLowerCase()

    // Torso bones or bones with no clear side indicator default to center
    if (category === BoneCategory.Torso) {
      return BoneSide.Center
    }

    // Check for left indicators
    // ^l_ means starts with l_
    // _left$ means ends with _left
    const left_patterns = ['left$', '^left', '^l_', '_l$']
    if (left_patterns.some(pattern => new RegExp(pattern).test(normalized))) {
      return BoneSide.Left
    }

    // Check for right indicators
    // ^r_ means starts with r_
    const right_patterns = ['right$', '^right', '^r_', '_r$']
    if (right_patterns.some(pattern => new RegExp(pattern).test(normalized))) {
      return BoneSide.Right
    }

    // let's look to see if "right" or "left" appears anywhere in the name
    if (normalized.includes('left')) {
      return BoneSide.Left
    } else if (normalized.includes('right')) {
      return BoneSide.Right
    }

    // Final check since this can create false/positives (shoulder will match to right)
    //  let's fall back to see if the last character is L or R
    // this is common in Blender rigs (e.g., "armL", "legR")
    const last_char = normalized.charAt(normalized.length - 1)
    if (last_char.toLowerCase() === 'l') {
      return BoneSide.Left
    } else if (last_char.toLowerCase() === 'r') {
      return BoneSide.Right
    }

    return BoneSide.Unknown // mark as unknown to help us develop this more later
  }

  /**
   * Normalize bone names for comparison by:
   * This will help us later when done auto-mapping and we want more similar names 
   */
  private static normalize_bone_name (bone_name: string, category: BoneCategory, side: BoneSide): string {
    let normalized = bone_name.toLowerCase()

    // Replace various separators with underscores
    normalized = normalized.replace(/[-.\s]/g, '_')

    // Remove common prefixes
    normalized = normalized.replace(/^(mixamorig|mixamorig_|rig_|bone_|jnt_|joint_|def_)/i, '')

    // Remove side indicators since we already know the side from the side parameter
    // This helps match paired bones (e.g., "arm_left" and "arm_right" both become "arm")
    if (side !== BoneSide.Center && side !== BoneSide.Unknown) {
      normalized = normalized.replace(/\b(left|right|l|r)\b/g, '')
      normalized = normalized.replace(/^(l|r)_/g, '')
      normalized = normalized.replace(/_(l|r)$/g, '')
      normalized = normalized.replace(/\.(l|r)$/g, '')
      // Clean up any resulting double underscores or trailing underscores
      normalized = normalized.replace(/__+/g, '_')
      normalized = normalized.replace(/^_|_$/g, '')
    }

    // Standardize numeric suffixes (e.g., "01", "001", "_1" all become "1")
    normalized = normalized.replace(/[._]0*(\d+)$/g, '$1')
    
    // Apply category-specific normalizations
    if (category === BoneCategory.Hands) {
      // Standardize finger naming variations
      // potentially do more here later with hand normalization
    } else if (category === BoneCategory.Legs) {
      // Standardize leg bone naming variations
      normalized = normalized.replace(/\b(upperleg|upleg|thigh)\b/g, 'thigh')
      normalized = normalized.replace(/\b(lowerleg|lowleg|shin|calf)\b/g, 'calf')
    } else if (category === BoneCategory.Arms) {
      // Standardize arm bone naming variations
      normalized = normalized.replace(/\b(upperarm|uparm)\b/g, 'upperarm')
      normalized = normalized.replace(/\b(lowerarm|lowarm|forearm)\b/g, 'forearm')
    }

    // Final cleanup
    normalized = normalized.replace(/__+/g, '_')
    normalized = normalized.replace(/^_|_$/g, '')

    return normalized
  }
}
