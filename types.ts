import { Vector3 } from 'three';
import React from 'react';

// Augment Global JSX namespace (permissive for stability)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
      // Core
      primitive: any;
      group: any;
      mesh: any;
      scene: any;
      
      // Geometries
      boxGeometry: any;
      cylinderGeometry: any;
      planeGeometry: any;
      sphereGeometry: any;
      capsuleGeometry: any;
      ringGeometry: any;
      circleGeometry: any;
      coneGeometry: any;
      dodecahedronGeometry: any;
      icosahedronGeometry: any;
      octahedronGeometry: any;
      tetrahedronGeometry: any;
      torusGeometry: any;
      torusKnotGeometry: any;
      tubeGeometry: any;

      // Materials
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      meshPhysicalMaterial: any;
      meshPhongMaterial: any;
      meshLambertMaterial: any;
      meshNormalMaterial: any;
      meshDepthMaterial: any;
      meshToonMaterial: any;
      pointsMaterial: any;
      
      // Lights
      pointLight: any;
      ambientLight: any;
      directionalLight: any;
      spotLight: any;
      hemisphereLight: any;
      rectAreaLight: any;

      // Helpers & Misc
      fog: any;
      color: any;
      gridHelper: any;
      axesHelper: any;
      arrowHelper: any;
    }
  }
}

// Augment React module JSX namespace (needed for some TS configurations)
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
      // Core
      primitive: any;
      group: any;
      mesh: any;
      scene: any;
      
      // Geometries
      boxGeometry: any;
      cylinderGeometry: any;
      planeGeometry: any;
      sphereGeometry: any;
      capsuleGeometry: any;
      ringGeometry: any;
      circleGeometry: any;
      coneGeometry: any;
      dodecahedronGeometry: any;
      icosahedronGeometry: any;
      octahedronGeometry: any;
      tetrahedronGeometry: any;
      torusGeometry: any;
      torusKnotGeometry: any;
      tubeGeometry: any;

      // Materials
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      meshPhysicalMaterial: any;
      meshPhongMaterial: any;
      meshLambertMaterial: any;
      meshNormalMaterial: any;
      meshDepthMaterial: any;
      meshToonMaterial: any;
      pointsMaterial: any;
      
      // Lights
      pointLight: any;
      ambientLight: any;
      directionalLight: any;
      spotLight: any;
      hemisphereLight: any;
      rectAreaLight: any;

      // Helpers & Misc
      fog: any;
      color: any;
      gridHelper: any;
      axesHelper: any;
      arrowHelper: any;
    }
  }
}

export enum ViewMode {
  FREE = 'FREE',
  FOLLOW_PRESENTER = 'FOLLOW_PRESENTER',
  POV_AGENT = 'POV_AGENT',
  OVERHEAD = 'OVERHEAD',
  HEATMAP = 'HEATMAP',
  AI_GUIDED = 'AI_GUIDED',
  SPLIT_SCREEN = 'SPLIT_SCREEN'
}

export enum RepresentationMode {
  MINIMAL = 'MINIMAL',
  FULL = 'FULL'
}

export enum AgentStyle {
  BOX = 'BOX',
  CAPSULE = 'CAPSULE',
  ROBOT = 'ROBOT',
  VR_HEADSET = 'VR_HEADSET'
}

export interface PointOfInterest {
  id: string;
  position: Vector3;
  label: string;
  type: 'KNOB' | 'SCREEN' | 'KEY' | 'GENERAL';
}

export type AgentRole = 'PRESENTER' | 'REVIEWER' | 'OBSERVER';

export type AgentBehaviorState = 'IDLE' | 'MOVING' | 'INSPECTING' | 'DISCUSSING' | 'FOLLOWING' | 'FOLLOWING_AGENT';

export interface AgentState {
  id: string;
  name: string;
  role: AgentRole;
  color: string;
  behavior: AgentBehaviorState;
  currentPoiId: string | null; // The POI they are interested in
  attentionLevel: number; // 0-1, simulates cognitive load/focus
}

export interface SimulationFrame {
  time: number;
  isPlaying: boolean;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  text: string;
  timestamp: number;
}

export type InsightType = 'RISK' | 'RATIONALE' | 'ACTION';

// DETAILED DESIGN TYPES
export type DecisionRole = "TRIGGER" | "RATIONALE" | "INTERMEDIATE_DECISION" | "FINAL_DECISION";

export interface InsightDetails {
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Review' | 'Approved' | 'Rejected';
  assignee?: string;
  dueDate?: string;
  componentReference?: string; // The name of the component from the tree
  
  // Design Review Metadata
  designStage?: "DETAILED_DESIGN";
  decisionRole?: DecisionRole;

  // Risk Specific
  impact?: string;
  mitigationStrategy?: string;
  
  // Rationale Specific
  designDriver?: string;
  alternativesConsidered?: string;
  tradeoffAnalysis?: string;
  
  // Action Specific
  department?: string;
}

export interface InsightCard {
  id: string;
  type: InsightType;
  agentId: string;
  title: string;
  description: string;
  timestamp: number;
  relatedPoiId?: string;
  sourceMessageIds?: string[]; // Array of IDs linking back to the conversation cluster
  details: InsightDetails;
  
  // NEW: Compliance & Historical Data
  affectedRequirementIds?: string[];
  kbRecommendations?: string[];
}

// --- SCENE GRAPH TYPES ---

export interface SceneNode {
  id: string;
  name: string;
  type: 'GROUP' | 'MESH' | 'PART';
  children?: SceneNode[];
}

export interface ObjectState {
  id: string;
  visible: boolean;
  selected: boolean;
  expanded?: boolean;
}

// --- DOCUMENTATION TYPES ---

export interface Requirement {
  id: string;
  code: string;
  description: string;
  category: 'MECHANICAL' | 'ELECTRICAL' | 'ERGONOMIC' | 'SAFETY';
  status: 'MET' | 'PENDING' | 'AT_RISK';
}

export interface KBEntry {
    id: string;
    category: InsightType;
    triggerKeyword: string;
    recommendation: string;
}

// --- COMMENT SYSTEM TYPES ---

export interface SpatialComment {
    id: string;
    type: 'text' | 'drawing';
    content: string;
    drawingData?: string; // Base64 PNG for drawings
    author: string;
    authorColor: string;
    timestamp: number;
    position: { x: number; y: number; z: number };
    attachedToNodeId: string;
    attachedToNodeName: string;
    assignees: string[]; // @mentioned users
    resolved: boolean;
    linkedToMeeting: boolean; // If captured in meeting transcript
    // NEW: UI state for 3D display
    expanded?: boolean; // Whether comment text is expanded in 3D scene
    screenOffset?: { x: number; y: number }; // Offset for drag positioning
}

export type CommentMode = 'none' | 'placing-comment' | 'placing-drawing' | 'positioning-drawing' | 'drawing';

// --- STEP IMPORT TYPES ---

export interface ImportedModel {
    id: string;
    name: string;
    fileName: string;
    importedAt: number;
    sceneTree: SceneNode;
}

export type ModelType = 'synth' | 'bicycle';

// --- PANEL MODE TYPES ---

export type RightPanelMode = 'meeting' | 'comments';